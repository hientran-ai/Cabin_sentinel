import SwiftUI

@main
struct CabinSentinelApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = AppModel()

    init() { Bench.runIfRequested() }

    var body: some Scene {
        WindowGroup {
            RootView { MainTabs() }
                .environment(model)
                .tint(Theme.primary)
                .task { await model.boot() }
        }
    }
}

struct MainTabs: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            HomeView().tabItem { Label("Trang chủ", systemImage: "house") }.tag(0)
            SchoolView().tabItem { Label("Đưa đón", systemImage: "figure.and.child.holdinghands") }.tag(1)
            HistoryView().tabItem { Label("Lịch sử", systemImage: "clock") }.tag(2)
            AccountView().tabItem { Label("Tài khoản", systemImage: "person.crop.circle") }.tag(3)
        }
    }
}
