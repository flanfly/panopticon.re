---
title: No April Fools
author: seu
layout: blog
image: /img/crematoria.jpg
tint: light
---

No joke, Panopticon version 0.14 is done! With an impressive delay of 4 weeks past the deadline we finally finished the Crematoria milestone.

The most visible improvements are new open and save dialogs that are written in pure QML and work on all platforms.

![Screenshot of the open dialog]({{ site.url }}/img/open-dialog.png "The new open dialog")

We implemented the first abstract domain for the Abstract Interpretation framework: Kset. The Kset domain allows you the execute the assembly code over sets of values. To ensure the execution stops in the presents of loops, the cardinality of the set is capped (currently the maximum is 10). If there are more elements in the set the analysis concludes that all values are possible, otherwise the set is displayed next to the register.


![Screenshot of the Kset AI]({{ site.url }}/img/kset.png "Execution over the Kset domain")

### Changelog
 - Implement Kset abstract domain
 - Speed-up disassembly
 - Major rework of save, load and open dialogs
 - Fix various bugs in AI and graph layouting

Photos courtesy of Universal Pictures, Radar Pictures, One Race Productions and Primal Foe Productions.
