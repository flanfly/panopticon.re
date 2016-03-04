---
title: Pentridge is done
author: seu
layout: blog
image: /img/pentridge.jpg
tint: light
---

Today we finally finished the 0.12 version of Panopticon code named "Pentridge". Starting with this version we accelerated the release cycle to one milestone every 6 weeks. Instead of dragging on for a year before releasing something usable.

This version improved the graph view. Basic blocks no longer overlap and the function entry point is centered on start. Also edges are no longer drawn as possibly overlapping straight lines. A simple ELF parser is now part of the application as well as saving and loading sessions. Aside from the new features various bugs in the AVR disassembler has been fixed and the x86 disassembler prototype resurrected.

### Changelog
- ELF loader
- Primitive x86 disassembling
- Various graph view improvements
- Disassembles whole AVR interrupt vector table

[Image credit](https://commons.wikimedia.org/wiki/File:Pentridge_Prison_Panopticon_Ruin_2015.jpg)
