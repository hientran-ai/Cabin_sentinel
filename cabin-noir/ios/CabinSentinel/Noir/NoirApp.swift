import SwiftUI

/// "Cabin Noir": the same backend, models and screens as CabinSentinel, wrapped in a dark, material-based shell
/// (hero car, glass cards, floating tab bar). Installed as its own app so both designs can be compared side by side.
@main
struct CabinNoirApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model: AppModel
    @State private var device: DeviceModel

    init() {
        let m = AppModel()
        _model = State(initialValue: m)
        _device = State(initialValue: DeviceModel(api: m.api))
    }

    var body: some Scene {
        WindowGroup {
            Group {
                #if DEBUG
                if CommandLine.arguments.contains("--preview-launch") { NoirLaunchView() }
                else if CommandLine.arguments.contains("--preview-picker") { NoirDestinationPicker().onAppear { model.loadPreview() } }
                else if CommandLine.arguments.contains("--preview-icons") {
                    let names = ["figure.child", "stroller", "stroller.fill", "teddybear", "teddybear.fill", "person.2.fill", "person.crop.circle.badge.questionmark", "figure.2.and.child.holdinghands", "face.smiling", "pawprint", "backpack", "bag", "person.fill"]
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 18) {
                        ForEach(names, id: \.self) { n in VStack { Image(systemName: n).font(.system(size: 30)).foregroundStyle(.white); Text(n).font(.system(size: 8)).foregroundStyle(.gray) } }
                    }.padding().frame(maxHeight: .infinity).background(Noir.canvas)
                }
                else { content }
                #else
                content
                #endif
            }
            .environment(model)
            .environment(device)
            .tint(Noir.accent)
            .environment(\.onAccent, .black)
            .preferredColorScheme(.dark)
            .task {
                #if DEBUG
                #if DEBUG && canImport(ActivityKit) && !targetEnvironment(macCatalyst)
                if CommandLine.arguments.contains { $0.hasPrefix("--preview-live") } { LiveActivityCenter.shared.debugStart() }
                #endif
                if CommandLine.arguments.contains("--preview-home") { model.loadPreview(); return }
                if let t = CommandLine.arguments.first(where: { $0.hasPrefix("--preview-tab=") }).flatMap({ Int($0.dropFirst("--preview-tab=".count)) }) { model.tab = t }
                #endif
                await model.boot()
            }
        }
    }

    @ViewBuilder private var content: some View {
        if device.isPaired {
            NoirDeviceHome()
        } else {
            RootView(main: { NoirTabs() }, signedOut: { NoirLanding() })
        }
    }
}

/// Native TabView: iOS 26 draws its Liquid Glass tab bar by itself, earlier systems get the standard bar.
struct NoirTabs: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            Tab("Xe", systemImage: "car.fill", value: 0) { NoirHome() }
            Tab("Đưa đón", systemImage: "figure.and.child.holdinghands", value: 1) { NoirSchool() }
            Tab("Lịch sử", systemImage: "clock.fill", value: 2) { NoirHistory() }
            Tab("Tài khoản", systemImage: "person.crop.circle.fill", value: 3) { NoirAccount() }
        }
        .sensoryFeedback(.selection, trigger: model.tab)
    }
}

#if DEBUG
extension AppModel {
    /// Layout checks in the Simulator (`--preview-home`): a fixed vehicle status, no server.
    func loadPreview() {
        let json = """
        {"vehicle":{"id":"veh_p","model":"VF 8","plate":"30A-123.45","name":"Xe thử","color":"white","image":"vf8"},
         "role":"owner","scenario":"live","restricted":false,
         "verdict":{"level":"critical","title":"Có thể có người trong xe","sub":"Mở ứng dụng để xem việc cần làm.","current":true,"seat":"rear_right","conf":0.88},
         "camera":"ok","connection":"online","source":"device",
         "seats":[{"key":"rear_left","label":"Ghế sau trái","occ":true,"conf":0.91,"kind":"person","age":"child"},
                  {"key":"rear_mid","label":"Ghế sau giữa","occ":false,"conf":0,"kind":null},
                  {"key":"rear_right","label":"Ghế sau phải","occ":true,"conf":0.85,"kind":"pet"}],
         "items":[{"name":"Ba lô","seat":"rear_mid","conf":0.77},{"name":"Chai nước","seat":"rear_left","conf":0.63}]}
        """
        guard let st = try? JSONDecoder().decode(VehicleStatus.self, from: Data(json.utf8)) else { return }
        vehicles = [VehicleSummary(vehicle: st.vehicle, role: "owner", level: "critical", title: st.verdict?.title, incidentId: nil)]
        selectedId = st.vehicle.id
        status = st
        phase = .main
    }
}
#endif
