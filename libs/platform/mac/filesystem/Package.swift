// swift-tools-version: 6.0
import PackageDescription

let strictSwiftSettings: [SwiftSetting] = [
    .enableUpcomingFeature("ExistentialAny"),
    .enableUpcomingFeature("InternalImportsByDefault"),
    .enableUpcomingFeature("MemberImportVisibility"),
]

let package = Package(
    name: "MacFilesystem",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(name: "MacFilesystem", targets: ["MacFilesystem"])
    ],
    targets: [
        .target(
            name: "MacFilesystem",
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "MacFilesystemTests",
            dependencies: ["MacFilesystem"],
            swiftSettings: strictSwiftSettings
        ),
    ]
)
