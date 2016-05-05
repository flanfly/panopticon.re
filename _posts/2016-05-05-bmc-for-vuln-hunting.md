---
title: BMC for vulnerability hunting
author: seu
layout: blog
---

At the 5th Systems Software Verification Workshop in 2010, Sinz, Falke and Merz presented[^1] a model for encoding memory reads and writes as SMT formulas. The model is applied to programs in the LLVM language and allows checking for certain memory protection issues. The goal is to use Bounded Model Checking to find memory protection bugs in C/C++ code. The model has been implemented in a tool called LLBMC.

Their memory model assumes a linear address space in which the heap resides. For each `malloc` invocation they track the resulting pointer, size of the memory allocation and its status. Every time memory is accessed formulas are added stating that the access is inside a currently allocated space. If one of these formulas can't be satisfied the program has a bug leading to an out of bounds memory access.

For each call to `free` the memory model adds a formula stating that the pointer to be freed is currently allocated. In case one of these formulas are unsatisfiable, a double free is possible. Additionally formulas are added to verify that no allocated pointers remain after the program has exited. This allows finding some cases of memory leaks.

The model developed by Sinz et.al. is rather simple and only considers the heap[^2]. Aside from tracking the life cycle of heap pointers from sources to sinks inside a linear address space no assumptions are made. This allows to model to be applied to a wide range of applications written in memory unsafe languages like the C family.

From a security perspective the model has a large drawback that makes it insufficient for finding critical memory corruption bugs: it considers all writes into allocated regions as harmless. Sadly this is not the case. A program that allows writing a code pointer with an attacker controlled value is vulnerable. C++ applications in particular have their heap littered with code pointers in the form of vtable references. The problem becomes even more obvious when we consider the stack. A straight forward extension of the memory model presented by Sinz et.al. to the stack would grant writes to the saved instruction pointer and the saved stack frame bottom pointer.

While forming a good foundation the memory model is not precise enough for finding generic memory corruption vulnerabilities.

Extending The Memory Model
--------------------------

In order to be usable for vulnerability hunting, the model by Sinz et.al. needs to be extended in two ways. First, precise tracking of the stack and second informations about the code pointers in memory.

For identifying code pointers the static analysis developed for CPI[^3] could be used. The basic idea of CPI is to identify sensitive pointers using static analysis and instrument access to them in order to prevent code flow hijacking attacks like ROP. The static analysis defines pointers that need protection (so called sensitive pointers) recursively. A sensitive pointer is a pointer that either points to code or points to a object that includes another sensitive pointer. The analysis over approximates the set of sensitive pointers by including all pointers that could but may not point to sensitive pointers or code.

Instead of adding instrumentation code around sensitive pointer operation an extended LLBMC would generate formulas that state that it is impossible to write the pointer twice. This way, attacks on vtable pointers can be found by proving one of these formulas as unsatisfiable.

Sadly, this technique only works with heap-allocated objects and does not extend to code pointers on the stack. As LLBMC and CPI both work on LLVM instead of the machine code itself they cannot access the stack layout of functions. Same with calling conventions. These are part of the code generation pass that is done after all LLVM based analysis. So in order to be applied to code pointers on the stack like saved return addresses the analysis needs to work on the generated machine code.

Next Steps
----------

I believe a retrofitting the memory model on something like REIL[^4] is possible. Type inference would then be used to identify code pointers in the REIL. This will allow to apply the techniques outlined above to machine code. Some kind of heap analysis (points-to, shape, et.al.) could help to recursively identify pointers to sensitive pointers on heap and stack. Additionally this analysis can then be applied to binaries without access to source code.

### Footnotes
[^1]: [A Precise Memory Model for Low-Level Bounded Model Checking](https://www.usenix.org/legacy/event/ssv10/tech/full_papers/Sinz.pdf)
[^2]: The authors state that the model can be extended to work with the stack.
[^3]: [Code-Pointer Integrity](http://dslab.epfl.ch/pubs/cpi.pdf)
[^4]: [REIL: A platform-independent intermediate representation of disassembled code for static code analysis](https://static.googleusercontent.com/media/www.zynamics.com/en//downloads/csw09.pdf)
