#!/bin/sh
set -eu
developer_dir="$(xcode-select -p)"
if [ ! -d "$developer_dir/Toolchains" ]; then
    export TOOLCHAIN_DIR="$developer_dir"
fi
exec swiftlint "$@"
