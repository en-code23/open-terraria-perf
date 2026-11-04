// Fork: iPhone/iPad-App für Open-Terraria.
// Das gebaute Spiel liegt im App-Bundle (Ordner „game“) und wird von einem kleinen
// eingebauten Server (LocalServer) unter http://127.0.0.1:5299 ausgeliefert — gleiche
// Herkunft bei jedem Start, damit Spielstände (IndexedDB) erhalten bleiben.
// Derselbe Server ist auch die Mehrspieler-Brücke (WebSocket ⇄ TCP) zu echten
// Terraria-Servern (Vanilla, TShock, „Für LAN öffnen“ am Mac), Port 5290.
// Scene-Lebenszyklus (UIScene) — ab iOS 26/27 Pflicht, sonst Absturz beim Start.
import UIKit
import AVFoundation

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    static let server = LocalServer()

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Spielsound auch bei anderer Musik; Stummschalter wird beachtet (wie das Original)
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        OTLog.rotate()
        OTLog.write("Start \(UIDevice.current.model) iOS \(UIDevice.current.systemVersion)")
        AppDelegate.server.start()
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let cfg = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        cfg.delegateClass = SceneDelegate.self
        return cfg
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: ws)
        w.backgroundColor = .black
        w.rootViewController = GameViewController(server: AppDelegate.server)
        w.makeKeyAndVisible()
        window = w
        UIApplication.shared.isIdleTimerDisabled = true   // Bildschirm bleibt beim Spielen an
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        AppDelegate.server.start()   // iOS beendet Sockets im Hintergrund → neu öffnen
        UIApplication.shared.isIdleTimerDisabled = true
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        OTLog.write("Hintergrund")
        UIApplication.shared.isIdleTimerDisabled = false
        (window?.rootViewController as? GameViewController)?.saveNow()
    }
}
