import MacFilesystem
import SwiftUI

struct ContentView: View {
    private let supportDirectory = MacFilesystem.applicationSupportDirectory(appName: "MacExampleApp")

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Mac Example App")
                .font(.title)
            Text(supportDirectory.path)
                .font(.body)
        }
        .padding()
        .frame(minWidth: 480, minHeight: 160)
    }
}
