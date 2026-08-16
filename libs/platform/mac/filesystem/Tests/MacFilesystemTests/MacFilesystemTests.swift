import Foundation
import MacFilesystem
import Testing

@Test func appendsAppNameToTheApplicationSupportPath() {
    let directory = MacFilesystem.applicationSupportDirectory(appName: "ExampleApp")
    #expect(directory.lastPathComponent == "ExampleApp")
    #expect(directory.path.contains("Application Support"))
}
