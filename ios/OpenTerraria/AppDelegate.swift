// Fork: iPhone/iPad-App für Open-Terraria.
// Das gebaute Spiel liegt im App-Bundle (Ordner „game“) und wird von einem kleinen
// eingebauten Server (LocalServer) unter http://127.0.0.1:5299 ausgeliefert — gleiche
// Herkunft bei jedem Start, damit Spielstände (IndexedDB) erhalten bleiben.
// Derselbe Server ist auch die Mehrspieler-Brücke (WebSocket ⇄ TCP) zu echten
// Terraria-Servern (Vanilla, TShock, „Für LAN öffnen“ am Mac), Port 5290.
import UIKit
import AVFoundation

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    let server = LocalServer()

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Spielsound auch bei anderer Musik; Stummschalter wird beachtet (wie das Original)
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        server.start()
        let w = UIWindow(frame: UIScreen.main.bounds)
        w.backgroundColor = .black
        w.rootViewController = GameViewController(server: server)
        w.makeKeyAndVisible()
        window = w
        UIApplication.shared.isIdleTimerDisabled = true   // Bildschirm bleibt beim Spielen an
        return true
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        server.start()   // iOS beendet Sockets im Hintergrund → neu öffnen
        UIApplication.shared.isIdleTimerDisabled = true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        UIApplication.shared.isIdleTimerDisabled = false
        (window?.rootViewController as? GameViewController)?.saveNow()
    }
}
