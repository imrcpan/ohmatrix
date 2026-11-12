#!/bin/bash

dotnet jb cleanupcode OhMatrix.slnx --profile='Built-in: Reformat Code' --no-build \
    --properties:DefineConstants=OHMATRIX_NATIVE_SDK

