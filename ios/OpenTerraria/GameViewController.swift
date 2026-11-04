import UIKit
import WebKit

/// Vollbild-WebView mit dem Spiel (Querformat, ohne Statusleiste, Home-Balken ausgeblendet).
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let server: LocalServer
    private var webView: WKWebView!
    private var bgTask: UIBackgroundTaskIdentifier = .invalid

    init(server: LocalServer) {
        self.server = server
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func loadView() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.websiteDataStore = .default()   // Spielstände dauerhaft (IndexedDB/localStorage)
        if #available(iOS 15.4, *) { cfg.preferences.isElementFullscreenEnabled = true }
        // Dem Spiel mitteilen, dass es in der App läuft (Brücke, kein Vollbild-Knopf, kein Service Worker)
        let boot = """
        window.__otNative = { platform: 'ios', bridgePort: \(LocalServer.bridgePort), version: '\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] ?? "1")' };
        """
        cfg.userContentController.addUserScript(WKUserScript(source: boot, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // Diagnose: Fehler/Warnungen des Spiels + WebGL-Kontextverlust → Logdatei (Dokumente/ot-log.txt)
        cfg.userContentController.add(LogHandler(), name: "otlog")
        cfg.userContentController.addUserScript(WKUserScript(source: GameViewController.logJS, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #if targetEnvironment(simulator) || DEBUG
        // Nur Simulator/Debug-Build (Tests): `simctl launch … -otEval "<js>"` bzw. devicectl
        if let js = UserDefaults.standard.string(forKey: "otEval"), !js.isEmpty {
            cfg.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        #endif
        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.isOpaque = true
        wv.backgroundColor = .black
        wv.scrollView.backgroundColor = .black
        wv.scrollView.isScrollEnabled = false
        wv.scrollView.bounces = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.allowsBackForwardNavigationGestures = false
        wv.allowsLinkPreview = false
        wv.navigationDelegate = self
        wv.uiDelegate = self
        if #available(iOS 16.4, *) { wv.isInspectable = true }   // Safari → Entwickler → Gerät
        webView = wv
        view = wv
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        load()
    }

    private func load() {
        // ?nosw: alle Dateien liegen lokal in der App, kein Service Worker nötig
        guard let url = URL(string: "http://127.0.0.1:\(LocalServer.gamePort)/?nosw") else { return }
        server.whenReady { [weak self] in self?.webView.load(URLRequest(url: url)) }
    }

    /// Beim Wechsel in den Hintergrund speichern (wie das Original)
    func saveNow() {
        bgTask = UIApplication.shared.beginBackgroundTask { [weak self] in self?.endBg() }
        webView.evaluateJavaScript("Promise.resolve(window.__swFlow && window.__swFlow.doSave && window.__swFlow.doSave(true)).then(()=>1,()=>0)") { [weak self] _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { self?.endBg() }
        }
    }
    private func endBg() {
        if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid }
    }

    // Absturz des WebContent-Prozesses (z. B. Speicherdruck) → neu laden statt weißem Bild
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        OTLog.write("WebContent-Prozess beendet → neu laden")
        load()
    }
    /// privater WebKit-Rückruf mit Grund (0 Speicherlimit, 1 CPU-Limit, 2 vom Client, 3 Absturz …)
    @objc(_webView:webContentProcessDidTerminateWithReason:)
    func _webView(_ webView: WKWebView, webContentProcessDidTerminateWithReason reason: Int) {
        OTLog.write("WebContent beendet, Grund=\(reason) (0=Speicherlimit 1=CPU 2=Client 3=Absturz)")
        load()
    }

    /// JS-Seite der Diagnose
    static let logJS = """
    (function(){var post=function(l,a){try{window.webkit.messageHandlers.otlog.postMessage(l+' '+Array.prototype.map.call(a,function(x){try{return typeof x==='string'?x:(x&&x.stack)||JSON.stringify(x)}catch(e){return String(x)}}).join(' ').slice(0,1500))}catch(e){}};
    ['error','warn'].forEach(function(k){var o=console[k];console[k]=function(){var a0=String(arguments[0]||'');if(a0.indexOf('[beat]')<0&&a0.indexOf('[bitmap')<0)post(k,arguments);return o.apply(console,arguments)}});
    addEventListener('error',function(e){post('onerror',[(e.message||'')+' @'+(e.filename||'')+':'+(e.lineno||'')])});
    addEventListener('unhandledrejection',function(e){post('reject',[e.reason&&e.reason.stack||String(e.reason)])});
    document.addEventListener('webglcontextlost',function(e){post('gl',['context lost on '+(e.target&&e.target.id)])},true);
    var ig=false;setInterval(function(){var g=window.__swGame;if(!!g!==ig){ig=!!g;post('state',[ig?'ingame':'menu'])}},1000);
    post('boot',[location.href]);})();
    """

    // Externe Links (z. B. Credits/GitHub) in Safari öffnen
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = navigationAction.request.url, let host = u.host,
           host != "127.0.0.1", host != "localhost", navigationAction.targetFrame?.isMainFrame ?? true,
           ["http", "https"].contains(u.scheme ?? "") {
            UIApplication.shared.open(u)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = navigationAction.request.url { UIApplication.shared.open(u) }
        return nil
    }
    // alert/confirm/prompt des Spiels als native Dialoge
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Abbrechen", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(a, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: "Abbrechen", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        present(a, animated: true)
    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        OTLog.write("Speicherwarnung (App)")
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
}


/// Logdatei in Dokumente (über Finder/„Dateien“ und devicectl abrufbar)
enum OTLog {
    static let url: URL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("ot-log.txt")
    private static let q = DispatchQueue(label: "ot.log")
    private static let fmt: DateFormatter = { let f = DateFormatter(); f.dateFormat = "HH:mm:ss.SSS"; return f }()
    static func rotate() {
        q.sync {
            let prev = url.deletingLastPathComponent().appendingPathComponent("ot-log.prev.txt")
            try? FileManager.default.removeItem(at: prev)
            try? FileManager.default.moveItem(at: url, to: prev)
        }
    }
    static func write(_ s: String) {
        let line = "\(fmt.string(from: Date())) \(s)\n"
        print(line, terminator: "")
        q.async {
            if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(Data(line.utf8)); try? h.close() }
            else { try? Data(line.utf8).write(to: url) }
        }
    }
}

private final class LogHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        OTLog.write("js " + String(describing: m.body))
    }
}
