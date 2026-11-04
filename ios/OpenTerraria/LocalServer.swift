import Foundation
import Network
import CryptoKit

/// Kleiner Server nur für dieses Gerät (127.0.0.1):
///  - Port 5299: liefert das Spiel aus dem App-Bundle (HTTP/1.1, keep-alive, Range)
///  - Port 5290: Mehrspieler-Brücke WebSocket ⇄ TCP (`ws://127.0.0.1:5290/?host=H&port=P`)
///    zu echten Terraria-Servern (Vanilla, TShock, LAN-Welten vom Mac, Internet).
final class LocalServer {
    static let gamePort: UInt16 = 5299
    static let bridgePort: UInt16 = 5290

    let root: URL = Bundle.main.resourceURL!.appendingPathComponent("game", isDirectory: true)
    private let queue = DispatchQueue(label: "ot.server")
    private var listeners: [UInt16: NWListener] = [:]
    private var ready = false
    private var waiters: [() -> Void] = []

    /// Startet (oder erneuert nach Hintergrund) beide Listener
    func start() {
        queue.async {
            for port in [Self.gamePort, Self.bridgePort] {
                if let l = self.listeners[port], l.state == .ready { continue }
                self.listeners[port]?.cancel()
                self.listeners[port] = nil
                self.listen(port, attempt: 0)
            }
        }
    }

    /// Ruft `fn` (Main-Thread), sobald der Spiel-Port bereit ist
    func whenReady(_ fn: @escaping () -> Void) {
        queue.async {
            if self.ready { DispatchQueue.main.async(execute: fn) } else { self.waiters.append(fn) }
        }
    }

    private func listen(_ port: UInt16, attempt: Int) {
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
        guard let l = try? NWListener(using: params) else {
            retry(port, attempt)
            return
        }
        l.newConnectionHandler = { [weak self] c in
            guard let self = self else { c.cancel(); return }
            HTTPConn(conn: c, server: self, isBridge: port == Self.bridgePort).start()
        }
        l.stateUpdateHandler = { [weak self] st in
            guard let self = self else { return }
            switch st {
            case .ready:
                if port == Self.gamePort && !self.ready {
                    self.ready = true
                    let w = self.waiters; self.waiters = []
                    w.forEach { f in DispatchQueue.main.async(execute: f) }
                }
            case .failed:
                l.cancel()
                if self.listeners[port] === l { self.listeners[port] = nil }
                self.retry(port, attempt)
            default: break
            }
        }
        listeners[port] = l
        l.start(queue: queue)
    }

    private func retry(_ port: UInt16, _ attempt: Int) {
        guard attempt < 40 else { return }
        queue.asyncAfter(deadline: .now() + 0.25) { self.listen(port, attempt: attempt + 1) }
    }

    // MARK: Dateien

    static let mime: [String: String] = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8", "json": "application/json; charset=utf-8", "webmanifest": "application/manifest+json",
        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
        "svg": "image/svg+xml", "ico": "image/x-icon", "wasm": "application/wasm", "ogg": "audio/ogg", "mp3": "audio/mpeg",
        "wav": "audio/wav", "m4a": "audio/mp4", "woff": "font/woff", "woff2": "font/woff2", "ttf": "font/ttf", "otf": "font/otf",
        "txt": "text/plain; charset=utf-8", "zip": "application/zip", "xnb": "application/octet-stream", "bin": "application/octet-stream",
    ]

    /// Pfad → Datei im Spielordner (nie außerhalb); SPA: Seiten ohne Datei → index.html
    func resolve(_ rawPath: String) -> URL? {
        let path = rawPath.removingPercentEncoding ?? rawPath
        if path.contains("\0") { return nil }
        var url = root.appendingPathComponent(String(path.drop(while: { $0 == "/" })))
        url = url.standardizedFileURL
        let rootPath = root.standardizedFileURL.path
        guard url.path == rootPath || url.path.hasPrefix(rootPath + "/") else { return nil }
        var isDir: ObjCBool = false
        if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) {
            if isDir.boolValue { url.appendPathComponent("index.html") }
            return FileManager.default.fileExists(atPath: url.path) ? url : nil
        }
        if (path as NSString).pathExtension.isEmpty { return root.appendingPathComponent("index.html") }
        return nil
    }
}

/// Eine Verbindung: HTTP-Anfragen (keep-alive) oder WebSocket-Brücke
private final class HTTPConn {
    let conn: NWConnection
    let server: LocalServer
    let isBridge: Bool
    var buf = Data()
    var tcp: NWConnection?
    var wsBuf = Data()
    var closed = false
    /// eine serielle Queue für Browser- und Server-Seite (keine Datenrennen)
    let q = DispatchQueue(label: "ot.conn")

    init(conn: NWConnection, server: LocalServer, isBridge: Bool) {
        self.conn = conn; self.server = server; self.isBridge = isBridge
    }

    func start() {
        conn.stateUpdateHandler = { [self] st in
            if case .failed = st { close() }
            if case .cancelled = st { close() }
        }
        conn.start(queue: q)
        readHTTP()
    }

    func close() {
        if closed { return }
        closed = true
        tcp?.cancel(); tcp = nil
        conn.cancel()
    }

    // MARK: HTTP

    func readHTTP() {
        if let r = buf.range(of: Data("\r\n\r\n".utf8)) {
            let head = String(decoding: buf[buf.startIndex..<r.lowerBound], as: UTF8.self)
            buf = Data(buf[r.upperBound...])
            handle(head: head)
            return
        }
        if buf.count > 64 * 1024 { close(); return }
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [self] data, _, done, err in
            if let d = data, !d.isEmpty { buf.append(d) }
            if err != nil || (done && (data?.isEmpty ?? true)) { close(); return }
            readHTTP()
        }
    }

    func handle(head: String) {
        var lines = head.components(separatedBy: "\r\n")
        let first = lines.removeFirst().split(separator: " ")
        guard first.count >= 2 else { close(); return }
        let method = String(first[0]).uppercased()
        let target = String(first[1])
        var h: [String: String] = [:]
        for l in lines {
            guard let i = l.firstIndex(of: ":") else { continue }
            h[l[..<i].trimmingCharacters(in: .whitespaces).lowercased()] = l[l.index(after: i)...].trimmingCharacters(in: .whitespaces)
        }
        let comps = URLComponents(string: "http://x\(target)")
        let path = comps?.percentEncodedPath ?? "/"

        if (h["upgrade"] ?? "").lowercased() == "websocket" {
            guard isBridge else { close(); return }
            startBridge(headers: h, query: comps?.queryItems ?? [])
            return
        }
        if isBridge {
            // Der LAN-Helfer (Welten hosten) läuft nur am Mac; hier gibt es nur die Brücke
            if path == "/api/status" {
                send(status: 200, type: "application/json", body: Data(#"{"ok":false,"native":true,"error":"Hosten geht nur am Mac (LAN-Helfer)"}"#.utf8), extra: cors(h))
            } else {
                send(status: 404, type: "application/json", body: Data(#"{"ok":false}"#.utf8), extra: cors(h))
            }
            return
        }
        guard method == "GET" || method == "HEAD" else {
            send(status: 405, type: "text/plain", body: Data(), keepAlive: false)
            return
        }
        if path == "/sw.js" || path.hasPrefix("/__terraria/") {
            send(status: 404, type: "text/plain", body: Data("not found".utf8))
            return
        }
        guard let file = server.resolve(path),
              let data = try? Data(contentsOf: file, options: .alwaysMapped) else {
            send(status: 404, type: "text/plain", body: Data("not found".utf8))
            return
        }
        let ext = file.pathExtension.lowercased()
        let type = LocalServer.mime[ext] ?? "application/octet-stream"
        var extra = ["Accept-Ranges": "bytes",
                     "Cache-Control": ext == "html" ? "no-cache" : "public, max-age=86400"]
        var body = data
        var status = 200
        if let range = h["range"], range.hasPrefix("bytes="), !data.isEmpty {
            let spec = range.dropFirst(6).split(separator: ",")[0].split(separator: "-", omittingEmptySubsequences: false)
            let total = data.count
            var a = Int(spec.first ?? "") ?? -1
            var b = spec.count > 1 ? (Int(spec[1]) ?? total - 1) : total - 1
            if a < 0 { a = max(0, total - b); b = total - 1 }   // bytes=-N
            b = min(b, total - 1)
            if a <= b && a < total {
                body = data.subdata(in: a..<(b + 1))
                status = 206
                extra["Content-Range"] = "bytes \(a)-\(b)/\(total)"
            } else {
                send(status: 416, type: type, body: Data(), extra: ["Content-Range": "bytes */\(total)"])
                return
            }
        }
        send(status: status, type: type, body: method == "HEAD" ? Data() : body, extra: extra, length: body.count)
    }

    func cors(_ h: [String: String]) -> [String: String] {
        guard let o = h["origin"], originOk(o) else { return [:] }
        return ["Access-Control-Allow-Origin": o, "Vary": "Origin"]
    }

    func originOk(_ o: String) -> Bool {
        o == "http://127.0.0.1:\(LocalServer.gamePort)" || o == "http://localhost:\(LocalServer.gamePort)"
    }

    func send(status: Int, type: String, body: Data, extra: [String: String] = [:], length: Int? = nil, keepAlive: Bool = true) {
        let reason = [200: "OK", 206: "Partial Content", 404: "Not Found", 405: "Method Not Allowed", 416: "Range Not Satisfiable"][status] ?? "OK"
        var head = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(type)\r\nContent-Length: \(length ?? body.count)\r\n"
        head += "Connection: \(keepAlive ? "keep-alive" : "close")\r\n"
        for (k, v) in extra { head += "\(k): \(v)\r\n" }
        head += "\r\n"
        var out = Data(head.utf8)
        out.append(body)
        conn.send(content: out, completion: .contentProcessed { [self] err in
            if err != nil || !keepAlive { close(); return }
            readHTTP()
        })
    }

    // MARK: WebSocket ⇄ TCP

    func startBridge(headers h: [String: String], query: [URLQueryItem]) {
        guard let key = h["sec-websocket-key"], originOk(h["origin"] ?? "") else { close(); return }
        let host = (query.first { $0.name == "host" }?.value ?? "127.0.0.1").trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        guard let portNum = UInt16(query.first { $0.name == "port" }?.value ?? "7777"), portNum >= 1024,
              portNum != LocalServer.gamePort, portNum != LocalServer.bridgePort,
              !host.isEmpty, host.range(of: #"^[A-Za-z0-9.:-]+$"#, options: .regularExpression) != nil else {
            close(); return
        }
        let accept = Data(Insecure.SHA1.hash(data: Data((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").utf8))).base64EncodedString()
        let resp = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: \(accept)\r\n\r\n"
        conn.send(content: Data(resp.utf8), completion: .contentProcessed { _ in })

        let opts = NWProtocolTCP.Options()
        opts.noDelay = true
        let t = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: portNum)!, using: NWParameters(tls: nil, tcp: opts))
        tcp = t
        t.stateUpdateHandler = { [self] st in
            switch st {
            case .failed, .cancelled: closeWS()
            default: break
            }
        }
        t.start(queue: q)
        pumpTCP()
        wsBuf = buf
        buf = Data()
        parseWS()
        readWS()
    }

    func pumpTCP() {
        tcp?.receive(minimumIncompleteLength: 1, maximumLength: 256 * 1024) { [self] data, _, done, err in
            if let d = data, !d.isEmpty { sendWS(d, opcode: 2) }
            if err != nil || done { closeWS(); return }
            pumpTCP()
        }
    }

    func sendWS(_ payload: Data, opcode: UInt8) {
        var f = Data([0x80 | opcode])
        let n = payload.count
        if n < 126 { f.append(UInt8(n)) }
        else if n < 65536 { f.append(126); f.append(UInt8(n >> 8)); f.append(UInt8(n & 255)) }
        else { f.append(127); for s in stride(from: 56, through: 0, by: -8) { f.append(UInt8((UInt64(n) >> UInt64(s)) & 255)) } }
        f.append(payload)
        conn.send(content: f, completion: .contentProcessed { _ in })
    }

    func closeWS() {
        if closed { return }
        sendWS(Data(), opcode: 8)
        conn.send(content: nil, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { [self] _ in close() })
    }

    func readWS() {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 256 * 1024) { [self] data, _, done, err in
            if let d = data, !d.isEmpty { wsBuf.append(d); parseWS() }
            if err != nil || done { close(); return }
            if !closed { readWS() }
        }
    }

    /// Browser-Frames (maskiert) → Nutzdaten an den Terraria-Server
    func parseWS() {
        while true {
            let b = [UInt8](wsBuf.prefix(14))
            guard b.count >= 2 else { return }
            let opcode = b[0] & 0x0f
            let masked = b[1] & 0x80 != 0
            var len = Int(b[1] & 0x7f)
            var off = 2
            if len == 126 { guard b.count >= 4 else { return }; len = Int(b[2]) << 8 | Int(b[3]); off = 4 }
            else if len == 127 {
                guard b.count >= 10 else { return }
                len = 0; for i in 2..<10 { len = len << 8 | Int(b[i]) }; off = 10
            }
            if len > 4 * 1024 * 1024 { close(); return }
            let maskLen = masked ? 4 : 0
            guard wsBuf.count >= off + maskLen + len else { return }
            let start = wsBuf.startIndex
            var payload = Data(wsBuf[(start + off + maskLen)..<(start + off + maskLen + len)])
            if masked {
                let m = [UInt8](wsBuf[(start + off)..<(start + off + 4)])
                payload.withUnsafeMutableBytes { p in
                    for i in 0..<p.count { p[i] ^= m[i & 3] }
                }
            }
            wsBuf = Data(wsBuf[(start + off + maskLen + len)...])
            switch opcode {
            case 0, 1, 2: tcp?.send(content: payload, completion: .contentProcessed { _ in })
            case 8: closeWS(); return
            case 9: sendWS(payload, opcode: 10)
            default: break
            }
        }
    }
}
