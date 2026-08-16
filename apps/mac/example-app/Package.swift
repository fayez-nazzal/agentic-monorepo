// swift-tools-version: 6.0
import PackageDescription

let strictSwiftSettings: [SwiftSetting] = [
    .enableUpcomingFeature("ExistentialAny"),
    .enableUpcomingFeature("InternalImportsByDefault"),
    .enableUpcomingFeature("MemberImportVisibility"),
]

let package = Package(
    name: "MacExampleApp",
    platforms: [
        .macOS(.v14)
    ],
    dependencies: [
        .package(path: "../../../libs/platform/mac/filesystem")
    ],
    targets: [
        .executableTarget(
            name: "MacExampleApp",
            dependencies: [
                .product(name: "MacFilesystem", package: "filesystem")
            ],
            swiftSettings: strictSwiftSettings
        )
    ]
)
