---
title: Thoughts on "A Precise Memory Model for Low-Level Bounded Model Checking"
author: seu
layout: blog
---

At the 5th Systems Software Verification Workshop in 2010, Sinz, Falke and Merz presented a model for encoding memory reads and writes as SMT formulars. The model is applyed to programs in the LLVM language and allows checking for certain memory protection issues. The goal is to use a technique called Bounded Model Checking to find memory protection bugs in C/C++ code. The model has been implemented in a tool called LLBMC.

Their memory model assumes a linear address space in which the heap resides. For each `malloc` invocation they track the resulting pointer, size of the memory allocation and its status. Every time memory is accessed formulares are added stating that the access in a given range is inside a currently allocated space. If one of these formulare can't be satisisfied the program has a bug leading to a OOB memory access.

For each call to `free()` to memory model adds a formulatre stating that the pointer to be freed must be currently allocated. In case one of these formulares are unsatifiable, a double free is possible. Additionally formulatre are added to verify that no allocated pointer remain after the program has exited. This allows finding some cases of memory leaks.

The model developed by Sinz et. al. is rather simple and only considers the heap[1]. Aside from tracking the life cycle of heap pointers from sources to sinks inside a linear address space no assumbtions are made. This allows to model to be applied to a wide range of applications written in memory unsafe languages like the C family.

From a security perspective the model has a large drawback that makes it unsufficent for finding critical memory corruption bugs: it conciders all writes into allocated regions as harmless. Sadly this is not the case. A program that allows writing a code pointer with an attacker controlled value is vulnerable. C++ applictions in paricular have their heap littered with code pointers in the form of vtables. This becomes even more obious when we consider the stack. A straight forward extension of the memory model presented by Sinz et. al. to the stack would grant writes to the saved instrunction pointer and the saved stack frame bottom.

While forming a good foundation, the "[..] Precise Memory Model for Low-Level Bounded Model Checking" is not precise enough for finding generic memory corruption vulnerabilities.

Extending The Memory Model
==========================

In order to be usable for vulnerablity hunting, the model by Sinz et. al. needs to be extended in two ways. First, precise tracking of the stack and second information about the code pointers in memory.

The second 

^[1]: The authors state that the model can easily extended to work with the stack.
