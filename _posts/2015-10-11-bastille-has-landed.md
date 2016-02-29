---
title: Bastille has landed
author: seu
layout: blog
---

In the last 10 months we started rebuilding Panopticon in [Rust](https://rust-lang.org/). We were able to reduce the amount of code from 17k to 12k lines. Hopefully a saver language will help us preventing bugs in the future.

Some parts are yet to be ported. This includes the hex view, serialization and the AMD64 disassembler.

### Installation

Rust projects are built using Cargo. Cargo fetches dependencies, builds everything and links libraries and executables. Cargo is part of the Rust toolchain you can download at their official website https://rust-lang.org. After you have the toolchain installed. a single ``cargo build --release`` compiles everything. The Panopticon frontend can now be found in ``target/release/qtpanopticon``. Running the unit tests can be done with ``cargo test``.

### Changelog
- **Breaking change:** Partial port from C++ to Rust
- Layout control flow graphs in QML
- Add function call graph
- Add comment function in graph view (double click on row to comment)
- Functions can be renamed by double clicking them in the function table
