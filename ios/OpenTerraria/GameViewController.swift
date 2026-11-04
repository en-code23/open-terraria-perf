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
        #if targetEnvironment(simulator)
        // Nur Simulator (automatische Tests): `simctl launch … -otEval "<js>"`
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

    // Absturz des WebContent-Prozesses (z. B. Speicherdruck) → neu laden statt schwarzem Bild
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { load() }

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

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
}
