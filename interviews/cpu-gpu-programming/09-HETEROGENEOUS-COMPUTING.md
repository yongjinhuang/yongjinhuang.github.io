# Chapter 9: Heterogeneous Computing - Portable GPU Programming

## Why Portability Matters

CUDA dominates GPU computing, but it only runs on NVIDIA hardware. The real world has AMD GPUs, Intel GPUs, Apple Silicon, mobile GPUs, and browsers. If your code must run everywhere, you need portable GPU programming.

```
THE GPU VENDOR LANDSCAPE

+---------------------------------------------------------------+
|                     YOUR APPLICATION                           |
+---------------------------------------------------------------+
         |              |             |            |
    +---------+   +---------+   +---------+   +---------+
    | NVIDIA  |   |   AMD   |   |  Intel  |   |  Apple  |
    | GeForce |   | Radeon  |   | Arc/Xe  |   |   M1+   |
    | Tesla   |   | Instinct|   | Ponte   |   | A-series|
    | Jetson  |   | MI300X  |   | Vecchio |   |         |
    +---------+   +---------+   +---------+   +---------+
         |              |             |            |
    +---------+   +---------+   +---------+   +---------+
    |  CUDA   |   |   HIP   |   |  SYCL   |   |  Metal  |
    | OpenCL  |   | OpenCL  |   | OpenCL  |   |         |
    | Vulkan  |   | Vulkan  |   | Vulkan  |   |         |
    | SYCL    |   |  SYCL   |   |         |   |         |
    +---------+   +---------+   +---------+   +---------+

PORTABLE APIS (run on multiple vendors):
  OpenCL  -> NVIDIA, AMD, Intel, ARM, Qualcomm, FPGA
  Vulkan  -> NVIDIA, AMD, Intel, ARM, Qualcomm
  SYCL    -> NVIDIA, AMD, Intel (via backends)
  WebGPU  -> Any GPU with a modern browser

VENDOR-SPECIFIC APIS:
  CUDA    -> NVIDIA only
  HIP     -> AMD (+ NVIDIA via translation layer)
  Metal   -> Apple only
```

The tension in heterogeneous computing is always **portability vs. performance vs. programmer productivity**. No single API wins on all three. This chapter teaches you every major option so you can make informed decisions.

---

## 1. OpenCL - The Original Portable GPU API

OpenCL (Open Computing Language) was created by Apple and standardized by Khronos Group in 2008. It was the first serious attempt at a vendor-neutral GPU compute API. OpenCL runs on NVIDIA, AMD, Intel, ARM, Qualcomm GPUs, and even FPGAs.

### Platform Model

OpenCL organizes hardware into a hierarchy:

```
OPENCL PLATFORM MODEL

+---------------------------------------------------+
|  HOST (CPU)                                        |
|                                                    |
|  +---------------------------------------------+  |
|  |  PLATFORM (e.g., NVIDIA CUDA, Intel OpenCL) |  |
|  |                                             |  |
|  |  +----------------+  +----------------+     |  |
|  |  | DEVICE 0       |  | DEVICE 1       |     |  |
|  |  | (GPU)          |  | (GPU)          |     |  |
|  |  |                |  |                |     |  |
|  |  | +----------+   |  | +----------+   |     |  |
|  |  | | Compute  |   |  | | Compute  |   |     |  |
|  |  | | Unit 0   |   |  | | Unit 0   |   |     |  |
|  |  | |  PE PE   |   |  | |  PE PE   |   |     |  |
|  |  | |  PE PE   |   |  | |  PE PE   |   |     |  |
|  |  | +----------+   |  | +----------+   |     |  |
|  |  | +----------+   |  | +----------+   |     |  |
|  |  | | Compute  |   |  | | Compute  |   |     |  |
|  |  | | Unit 1   |   |  | | Unit 1   |   |     |  |
|  |  | |  PE PE   |   |  | |  PE PE   |   |     |  |
|  |  | |  PE PE   |   |  | |  PE PE   |   |     |  |
|  |  | +----------+   |  | +----------+   |     |  |
|  |  +----------------+  +----------------+     |  |
|  +---------------------------------------------+  |
+---------------------------------------------------+

PE = Processing Element (analogous to a CUDA core)
Compute Unit = analogous to a Streaming Multiprocessor
```

### Execution Model

OpenCL uses a similar thread hierarchy to CUDA but with different names:

```
TERMINOLOGY MAPPING

CUDA                    OpenCL
----                    ------
Thread                  Work-item
Block                   Work-group
Grid                    NDRange
Warp (32 threads)       Wavefront (vendor-dependent, 32 or 64)
Shared Memory           Local Memory
Global Memory           Global Memory
Constant Memory         Constant Memory
Register / Local        Private Memory
```

### Memory Model

```
OPENCL MEMORY MODEL

+--------------------------------------------------+
|  HOST MEMORY (CPU RAM)                            |
|                                                    |
|  clEnqueueWriteBuffer / clEnqueueReadBuffer       |
|            |                        ^              |
|            v                        |              |
+--------------------------------------------------+
|  GLOBAL MEMORY (Device DRAM)                      |
|  - Accessible by all work-items                   |
|  - Highest latency, largest capacity              |
+--------------------------------------------------+
|  CONSTANT MEMORY                                  |
|  - Read-only, cached, broadcast to all work-items |
+--------------------------------------------------+
|                                                    |
|  WORK-GROUP (Compute Unit)                        |
|  +--------------------------------------------+   |
|  | LOCAL MEMORY (Shared Memory in CUDA)        |   |
|  | - Shared within work-group                  |   |
|  | - Low latency, limited size (~32-48 KB)     |   |
|  |                                             |   |
|  |  WORK-ITEM    WORK-ITEM    WORK-ITEM       |   |
|  |  +--------+   +--------+   +--------+      |   |
|  |  |PRIVATE |   |PRIVATE |   |PRIVATE |      |   |
|  |  |MEMORY  |   |MEMORY  |   |MEMORY  |      |   |
|  |  |(regs)  |   |(regs)  |   |(regs)  |      |   |
|  |  +--------+   +--------+   +--------+      |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
```

### Complete OpenCL Vector Addition Program

This is a complete, compilable OpenCL program. Note how much more verbose the host code is compared to CUDA:

```c
// vector_add_opencl.c
// Compile: gcc -o vector_add vector_add_opencl.c -lOpenCL

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef __APPLE__
#include <OpenCL/opencl.h>
#else
#include <CL/cl.h>
#endif

// ============================================================
// KERNEL SOURCE (embedded as a string - this runs on the GPU)
// ============================================================
const char *kernelSource =
    "__kernel void vector_add(\n"
    "    __global const float* A,\n"
    "    __global const float* B,\n"
    "    __global float* C,\n"
    "    const int N)\n"
    "{\n"
    "    int i = get_global_id(0);\n"
    "    if (i < N) {\n"
    "        C[i] = A[i] + B[i];\n"
    "    }\n"
    "}\n";

// Helper to check OpenCL errors
void checkError(cl_int err, const char* operation) {
    if (err != CL_SUCCESS) {
        fprintf(stderr, "Error during operation '%s': %d\n", operation, err);
        exit(1);
    }
}

int main() {
    const int N = 1024 * 1024;  // 1M elements
    size_t bytes = N * sizeof(float);

    // ========================================
    // 1. ALLOCATE AND INITIALIZE HOST MEMORY
    // ========================================
    float *h_A = (float*)malloc(bytes);
    float *h_B = (float*)malloc(bytes);
    float *h_C = (float*)malloc(bytes);

    for (int i = 0; i < N; i++) {
        h_A[i] = (float)i;
        h_B[i] = (float)(i * 2);
    }

    cl_int err;

    // ========================================
    // 2. GET PLATFORM AND DEVICE
    // ========================================
    cl_platform_id platform;
    err = clGetPlatformIDs(1, &platform, NULL);
    checkError(err, "Getting platform");

    cl_device_id device;
    err = clGetDeviceIDs(platform, CL_DEVICE_TYPE_GPU, 1, &device, NULL);
    if (err != CL_SUCCESS) {
        // Fall back to CPU if no GPU found
        err = clGetDeviceIDs(platform, CL_DEVICE_TYPE_CPU, 1, &device, NULL);
        checkError(err, "Getting device");
    }

    // Print device name
    char deviceName[128];
    clGetDeviceInfo(device, CL_DEVICE_NAME, 128, deviceName, NULL);
    printf("Using device: %s\n", deviceName);

    // ========================================
    // 3. CREATE CONTEXT AND COMMAND QUEUE
    // ========================================
    cl_context context = clCreateContext(NULL, 1, &device, NULL, NULL, &err);
    checkError(err, "Creating context");

    cl_command_queue queue = clCreateCommandQueue(context, device, 0, &err);
    checkError(err, "Creating command queue");

    // ========================================
    // 4. CREATE BUFFERS ON DEVICE
    // ========================================
    cl_mem d_A = clCreateBuffer(context, CL_MEM_READ_ONLY,  bytes, NULL, &err);
    checkError(err, "Creating buffer A");
    cl_mem d_B = clCreateBuffer(context, CL_MEM_READ_ONLY,  bytes, NULL, &err);
    checkError(err, "Creating buffer B");
    cl_mem d_C = clCreateBuffer(context, CL_MEM_WRITE_ONLY, bytes, NULL, &err);
    checkError(err, "Creating buffer C");

    // ========================================
    // 5. COPY DATA TO DEVICE
    // ========================================
    err = clEnqueueWriteBuffer(queue, d_A, CL_TRUE, 0, bytes, h_A, 0, NULL, NULL);
    checkError(err, "Writing buffer A");
    err = clEnqueueWriteBuffer(queue, d_B, CL_TRUE, 0, bytes, h_B, 0, NULL, NULL);
    checkError(err, "Writing buffer B");

    // ========================================
    // 6. BUILD THE PROGRAM FROM SOURCE
    // ========================================
    // OpenCL compiles kernels at RUNTIME (unlike CUDA's compile-time)
    cl_program program = clCreateProgramWithSource(
        context, 1, &kernelSource, NULL, &err);
    checkError(err, "Creating program");

    err = clBuildProgram(program, 1, &device, NULL, NULL, NULL);
    if (err != CL_SUCCESS) {
        // Get build log on failure
        size_t logSize;
        clGetProgramBuildInfo(program, device, CL_PROGRAM_BUILD_LOG,
                              0, NULL, &logSize);
        char *log = (char*)malloc(logSize);
        clGetProgramBuildInfo(program, device, CL_PROGRAM_BUILD_LOG,
                              logSize, log, NULL);
        fprintf(stderr, "Build log:\n%s\n", log);
        free(log);
        exit(1);
    }

    // ========================================
    // 7. CREATE KERNEL AND SET ARGUMENTS
    // ========================================
    cl_kernel kernel = clCreateKernel(program, "vector_add", &err);
    checkError(err, "Creating kernel");

    err  = clSetKernelArg(kernel, 0, sizeof(cl_mem), &d_A);
    err |= clSetKernelArg(kernel, 1, sizeof(cl_mem), &d_B);
    err |= clSetKernelArg(kernel, 2, sizeof(cl_mem), &d_C);
    err |= clSetKernelArg(kernel, 3, sizeof(int),    &N);
    checkError(err, "Setting kernel arguments");

    // ========================================
    // 8. EXECUTE THE KERNEL
    // ========================================
    size_t globalSize = N;
    size_t localSize  = 256;  // Work-group size

    err = clEnqueueNDRangeKernel(queue, kernel, 1, NULL,
                                  &globalSize, &localSize,
                                  0, NULL, NULL);
    checkError(err, "Enqueueing kernel");

    // ========================================
    // 9. READ RESULTS BACK TO HOST
    // ========================================
    err = clEnqueueReadBuffer(queue, d_C, CL_TRUE, 0, bytes,
                               h_C, 0, NULL, NULL);
    checkError(err, "Reading buffer C");

    // ========================================
    // 10. VERIFY RESULTS
    // ========================================
    int correct = 1;
    for (int i = 0; i < N; i++) {
        if (h_C[i] != h_A[i] + h_B[i]) {
            correct = 0;
            break;
        }
    }
    printf("Result: %s\n", correct ? "PASS" : "FAIL");

    // ========================================
    // 11. CLEANUP (every resource must be released)
    // ========================================
    clReleaseMemObject(d_A);
    clReleaseMemObject(d_B);
    clReleaseMemObject(d_C);
    clReleaseKernel(kernel);
    clReleaseProgram(program);
    clReleaseCommandQueue(queue);
    clReleaseContext(context);
    free(h_A);
    free(h_B);
    free(h_C);

    return 0;
}
```

### CUDA vs. OpenCL Side-by-Side

```
CUDA                                    OpenCL
----                                    ------
Compile-time kernel compilation         Runtime kernel compilation (JIT)
  nvcc my_kernel.cu                       clBuildProgram(program, ...)

Kernel launch syntax:                   Kernel launch API calls:
  kernel<<<grid, block>>>(args);          clSetKernelArg(k, 0, ...);
                                          clEnqueueNDRangeKernel(...);

~20 lines for simple program            ~100 lines for same program
NVIDIA only                             Any OpenCL-capable device
Mature tooling (Nsight, nvprof)         Limited vendor-specific tooling
cudaMalloc / cudaMemcpy                 clCreateBuffer / clEnqueueWriteBuffer
cudaDeviceSynchronize()                 clFinish(queue)

Unified source file (.cu)              Separate host/kernel source
Strong C++ support in kernels           C99-based kernel language (OpenCL C)
```

### OpenCL Kernel Language Features

OpenCL kernels use a C99-based language with built-in functions:

```c
// OpenCL kernel: matrix multiply with local memory tiling
__kernel void mat_mul(
    __global const float* A,
    __global const float* B,
    __global float* C,
    const int M, const int N, const int K)
{
    // Local (shared) memory for tiles
    __local float tileA[16][16];
    __local float tileB[16][16];

    int row = get_local_id(1);
    int col = get_local_id(0);
    int globalRow = get_global_id(1);
    int globalCol = get_global_id(0);

    float sum = 0.0f;

    // Loop over tiles
    for (int t = 0; t < (K + 15) / 16; t++) {
        // Load tile from global to local memory
        int tiledCol = t * 16 + col;
        int tiledRow = t * 16 + row;

        tileA[row][col] = (globalRow < M && tiledCol < K)
            ? A[globalRow * K + tiledCol] : 0.0f;
        tileB[row][col] = (tiledRow < K && globalCol < N)
            ? B[tiledRow * N + globalCol] : 0.0f;

        // Synchronize to make sure tile is loaded
        barrier(CLK_LOCAL_MEM_FENCE);

        // Multiply tile
        for (int k = 0; k < 16; k++) {
            sum += tileA[row][k] * tileB[k][col];
        }

        // Synchronize before loading next tile
        barrier(CLK_LOCAL_MEM_FENCE);
    }

    if (globalRow < M && globalCol < N) {
        C[globalRow * N + globalCol] = sum;
    }
}
```

### OpenCL 3.0 and Current Status

OpenCL 3.0 (released 2020) made a pragmatic change: only OpenCL 1.2 features are mandatory, and everything from 2.x became optional. This reflected reality, as most implementations never fully supported OpenCL 2.x.

```
OPENCL VERSION FEATURE SUPPORT

Feature                    | 1.2  | 2.0  | 3.0
---------------------------|------|------|------
Basic kernels              | REQ  | REQ  | REQ
Local memory               | REQ  | REQ  | REQ
Images                     | REQ  | REQ  | OPT
Shared Virtual Memory      |  -   | REQ  | OPT
Device-side enqueue        |  -   | REQ  | OPT
Pipes                      |  -   | REQ  | OPT
Generic address space      |  -   | REQ  | OPT
C++ kernels                |  -   |  -   | OPT

REQ = Required, OPT = Optional
```

---

## 2. Vulkan Compute

Vulkan is primarily known as a graphics API, but its compute shader support is excellent and offers the finest-grained control of any portable GPU API. If you need maximum control over GPU execution with cross-vendor support, Vulkan compute is the answer.

### Why Vulkan for Compute?

```
VULKAN COMPUTE ADVANTAGES

+------------------------------------------+
| Explicit everything:                      |
|   - Memory allocation and binding         |
|   - Command buffer recording/submission   |
|   - Synchronization (semaphores, fences)  |
|   - Pipeline creation and caching         |
|                                           |
| Cross-vendor:                             |
|   - NVIDIA, AMD, Intel, Qualcomm, ARM    |
|   - Desktop + Mobile + Embedded           |
|                                           |
| SPIR-V shader format:                     |
|   - Pre-compiled binary intermediate      |
|   - No runtime compilation overhead       |
|   - Multiple source languages (GLSL,      |
|     HLSL, C++) compile to SPIR-V          |
|                                           |
| Validation layers:                        |
|   - Debug builds catch API misuse         |
|   - Zero overhead in release builds       |
+------------------------------------------+
```

### Vulkan Compute Architecture

```
VULKAN COMPUTE PIPELINE

  Host (CPU)
  +--------------------------------------------------+
  |                                                    |
  |  1. Create VkInstance                              |
  |  2. Select VkPhysicalDevice (GPU)                 |
  |  3. Create VkDevice (logical device)              |
  |  4. Get VkQueue (compute queue family)             |
  |                                                    |
  |  5. Create VkBuffer + VkDeviceMemory              |
  |  6. Create VkDescriptorSet (bind buffers)         |
  |  7. Create VkShaderModule (from SPIR-V)           |
  |  8. Create VkPipeline (compute pipeline)          |
  |                                                    |
  |  9. Record VkCommandBuffer:                       |
  |     - Bind pipeline                               |
  |     - Bind descriptor sets                        |
  |     - Dispatch compute (workgroups)               |
  |                                                    |
  |  10. Submit to VkQueue                            |
  |  11. Wait on VkFence                              |
  |  12. Read back results                            |
  +--------------------------------------------------+
```

### Compute Shader (GLSL)

The shader itself is simple, similar to an OpenCL kernel. Write it in GLSL, then compile to SPIR-V:

```glsl
// vector_add.comp
// Compile: glslangValidator -V vector_add.comp -o vector_add.spv

#version 450

// Workgroup size declaration
layout(local_size_x = 256, local_size_y = 1, local_size_z = 1) in;

// Buffer bindings via descriptor sets
layout(set = 0, binding = 0) readonly buffer BufferA {
    float A[];
};

layout(set = 0, binding = 1) readonly buffer BufferB {
    float B[];
};

layout(set = 0, binding = 2) writeonly buffer BufferC {
    float C[];
};

// Push constant for N
layout(push_constant) uniform PushConstants {
    uint N;
};

void main() {
    uint i = gl_GlobalInvocationID.x;
    if (i < N) {
        C[i] = A[i] + B[i];
    }
}
```

### Vulkan Host Code (Simplified)

A complete Vulkan compute program is 500-800 lines. Here is the essential structure showing every step. This is heavily simplified but shows the real API:

```cpp
// vulkan_compute.cpp (simplified - real code needs error checking throughout)
// Compile: g++ -o vulkan_compute vulkan_compute.cpp -lvulkan

#include <vulkan/vulkan.h>
#include <vector>
#include <fstream>
#include <cstring>
#include <cstdio>

// Read SPIR-V binary from file
std::vector<uint32_t> readSPIRV(const char* filename) {
    std::ifstream file(filename, std::ios::binary | std::ios::ate);
    size_t fileSize = file.tellg();
    std::vector<uint32_t> buffer(fileSize / sizeof(uint32_t));
    file.seekg(0);
    file.read(reinterpret_cast<char*>(buffer.data()), fileSize);
    return buffer;
}

// Find suitable memory type index
uint32_t findMemoryType(VkPhysicalDevice physDevice,
                        uint32_t typeFilter,
                        VkMemoryPropertyFlags properties) {
    VkPhysicalDeviceMemoryProperties memProps;
    vkGetPhysicalDeviceMemoryProperties(physDevice, &memProps);
    for (uint32_t i = 0; i < memProps.memoryTypeCount; i++) {
        if ((typeFilter & (1 << i)) &&
            (memProps.memoryTypes[i].propertyFlags & properties) == properties) {
            return i;
        }
    }
    return UINT32_MAX;  // Not found
}

int main() {
    const uint32_t N = 1024 * 1024;
    const VkDeviceSize bufferSize = N * sizeof(float);

    // ========================================
    // 1. CREATE INSTANCE
    // ========================================
    VkApplicationInfo appInfo{};
    appInfo.sType = VK_STRUCTURE_TYPE_APPLICATION_INFO;
    appInfo.apiVersion = VK_API_VERSION_1_2;

    VkInstanceCreateInfo instanceInfo{};
    instanceInfo.sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO;
    instanceInfo.pApplicationInfo = &appInfo;

    VkInstance instance;
    vkCreateInstance(&instanceInfo, nullptr, &instance);

    // ========================================
    // 2. SELECT PHYSICAL DEVICE
    // ========================================
    uint32_t deviceCount = 0;
    vkEnumeratePhysicalDevices(instance, &deviceCount, nullptr);
    std::vector<VkPhysicalDevice> devices(deviceCount);
    vkEnumeratePhysicalDevices(instance, &deviceCount, devices.data());
    VkPhysicalDevice physDevice = devices[0];  // Pick first GPU

    // ========================================
    // 3. FIND COMPUTE QUEUE FAMILY
    // ========================================
    uint32_t queueFamilyCount = 0;
    vkGetPhysicalDeviceQueueFamilyProperties(physDevice,
                                              &queueFamilyCount, nullptr);
    std::vector<VkQueueFamilyProperties> queueFamilies(queueFamilyCount);
    vkGetPhysicalDeviceQueueFamilyProperties(physDevice,
                                              &queueFamilyCount,
                                              queueFamilies.data());

    uint32_t computeFamily = 0;
    for (uint32_t i = 0; i < queueFamilyCount; i++) {
        if (queueFamilies[i].queueFlags & VK_QUEUE_COMPUTE_BIT) {
            computeFamily = i;
            break;
        }
    }

    // ========================================
    // 4. CREATE LOGICAL DEVICE AND QUEUE
    // ========================================
    float queuePriority = 1.0f;
    VkDeviceQueueCreateInfo queueInfo{};
    queueInfo.sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO;
    queueInfo.queueFamilyIndex = computeFamily;
    queueInfo.queueCount = 1;
    queueInfo.pQueuePriorities = &queuePriority;

    VkDeviceCreateInfo deviceInfo{};
    deviceInfo.sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO;
    deviceInfo.queueCreateInfoCount = 1;
    deviceInfo.pQueueCreateInfos = &queueInfo;

    VkDevice device;
    vkCreateDevice(physDevice, &deviceInfo, nullptr, &device);

    VkQueue computeQueue;
    vkGetDeviceQueue(device, computeFamily, 0, &computeQueue);

    // ========================================
    // 5. CREATE BUFFERS (A, B, C)
    // ========================================
    auto createBuffer = [&](VkDeviceSize size, VkBufferUsageFlags usage,
                            VkMemoryPropertyFlags memProps,
                            VkBuffer& buffer, VkDeviceMemory& memory) {
        VkBufferCreateInfo bufInfo{};
        bufInfo.sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;
        bufInfo.size = size;
        bufInfo.usage = usage;
        bufInfo.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
        vkCreateBuffer(device, &bufInfo, nullptr, &buffer);

        VkMemoryRequirements memReqs;
        vkGetBufferMemoryRequirements(device, buffer, &memReqs);

        VkMemoryAllocateInfo allocInfo{};
        allocInfo.sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
        allocInfo.allocationSize = memReqs.size;
        allocInfo.memoryTypeIndex = findMemoryType(
            physDevice, memReqs.memoryTypeBits, memProps);

        vkAllocateMemory(device, &allocInfo, nullptr, &memory);
        vkBindBufferMemory(device, buffer, memory, 0);
    };

    VkBuffer bufA, bufB, bufC;
    VkDeviceMemory memA, memB, memC;
    VkMemoryPropertyFlags hostVisible =
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT |
        VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;

    createBuffer(bufferSize, VK_BUFFER_USAGE_STORAGE_BUFFER_BIT,
                 hostVisible, bufA, memA);
    createBuffer(bufferSize, VK_BUFFER_USAGE_STORAGE_BUFFER_BIT,
                 hostVisible, bufB, memB);
    createBuffer(bufferSize, VK_BUFFER_USAGE_STORAGE_BUFFER_BIT,
                 hostVisible, bufC, memC);

    // ========================================
    // 6. FILL INPUT BUFFERS
    // ========================================
    float* ptrA;
    vkMapMemory(device, memA, 0, bufferSize, 0, (void**)&ptrA);
    for (uint32_t i = 0; i < N; i++) ptrA[i] = (float)i;
    vkUnmapMemory(device, memA);

    float* ptrB;
    vkMapMemory(device, memB, 0, bufferSize, 0, (void**)&ptrB);
    for (uint32_t i = 0; i < N; i++) ptrB[i] = (float)(i * 2);
    vkUnmapMemory(device, memB);

    // ========================================
    // 7. CREATE DESCRIPTOR SET LAYOUT
    // ========================================
    VkDescriptorSetLayoutBinding bindings[3] = {};
    for (int i = 0; i < 3; i++) {
        bindings[i].binding = i;
        bindings[i].descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;
        bindings[i].descriptorCount = 1;
        bindings[i].stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
    }

    VkDescriptorSetLayoutCreateInfo layoutInfo{};
    layoutInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;
    layoutInfo.bindingCount = 3;
    layoutInfo.pBindings = bindings;

    VkDescriptorSetLayout descSetLayout;
    vkCreateDescriptorSetLayout(device, &layoutInfo, nullptr, &descSetLayout);

    // ========================================
    // 8. CREATE PIPELINE LAYOUT (with push constants)
    // ========================================
    VkPushConstantRange pushRange{};
    pushRange.stageFlags = VK_SHADER_STAGE_COMPUTE_BIT;
    pushRange.offset = 0;
    pushRange.size = sizeof(uint32_t);

    VkPipelineLayoutCreateInfo pipelineLayoutInfo{};
    pipelineLayoutInfo.sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    pipelineLayoutInfo.setLayoutCount = 1;
    pipelineLayoutInfo.pSetLayouts = &descSetLayout;
    pipelineLayoutInfo.pushConstantRangeCount = 1;
    pipelineLayoutInfo.pPushConstantRanges = &pushRange;

    VkPipelineLayout pipelineLayout;
    vkCreatePipelineLayout(device, &pipelineLayoutInfo,
                           nullptr, &pipelineLayout);

    // ========================================
    // 9. CREATE COMPUTE PIPELINE
    // ========================================
    auto spirvCode = readSPIRV("vector_add.spv");
    VkShaderModuleCreateInfo shaderInfo{};
    shaderInfo.sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;
    shaderInfo.codeSize = spirvCode.size() * sizeof(uint32_t);
    shaderInfo.pCode = spirvCode.data();

    VkShaderModule shaderModule;
    vkCreateShaderModule(device, &shaderInfo, nullptr, &shaderModule);

    VkComputePipelineCreateInfo pipelineInfo{};
    pipelineInfo.sType = VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO;
    pipelineInfo.stage.sType =
        VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    pipelineInfo.stage.stage = VK_SHADER_STAGE_COMPUTE_BIT;
    pipelineInfo.stage.module = shaderModule;
    pipelineInfo.stage.pName = "main";
    pipelineInfo.layout = pipelineLayout;

    VkPipeline pipeline;
    vkCreateComputePipelines(device, VK_NULL_HANDLE, 1,
                             &pipelineInfo, nullptr, &pipeline);

    // ========================================
    // 10. ALLOCATE AND WRITE DESCRIPTOR SETS
    // ========================================
    VkDescriptorPoolSize poolSize{};
    poolSize.type = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;
    poolSize.descriptorCount = 3;

    VkDescriptorPoolCreateInfo poolInfo{};
    poolInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO;
    poolInfo.maxSets = 1;
    poolInfo.poolSizeCount = 1;
    poolInfo.pPoolSizes = &poolSize;

    VkDescriptorPool descPool;
    vkCreateDescriptorPool(device, &poolInfo, nullptr, &descPool);

    VkDescriptorSetAllocateInfo descAllocInfo{};
    descAllocInfo.sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;
    descAllocInfo.descriptorPool = descPool;
    descAllocInfo.descriptorSetCount = 1;
    descAllocInfo.pSetLayouts = &descSetLayout;

    VkDescriptorSet descSet;
    vkAllocateDescriptorSets(device, &descAllocInfo, &descSet);

    // Write buffer descriptors
    VkBuffer buffers[3] = {bufA, bufB, bufC};
    VkWriteDescriptorSet writes[3] = {};
    VkDescriptorBufferInfo bufInfos[3] = {};

    for (int i = 0; i < 3; i++) {
        bufInfos[i].buffer = buffers[i];
        bufInfos[i].offset = 0;
        bufInfos[i].range = bufferSize;

        writes[i].sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;
        writes[i].dstSet = descSet;
        writes[i].dstBinding = i;
        writes[i].descriptorCount = 1;
        writes[i].descriptorType = VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;
        writes[i].pBufferInfo = &bufInfos[i];
    }
    vkUpdateDescriptorSets(device, 3, writes, 0, nullptr);

    // ========================================
    // 11. RECORD COMMAND BUFFER
    // ========================================
    VkCommandPoolCreateInfo cmdPoolInfo{};
    cmdPoolInfo.sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
    cmdPoolInfo.queueFamilyIndex = computeFamily;

    VkCommandPool cmdPool;
    vkCreateCommandPool(device, &cmdPoolInfo, nullptr, &cmdPool);

    VkCommandBufferAllocateInfo cmdBufInfo{};
    cmdBufInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
    cmdBufInfo.commandPool = cmdPool;
    cmdBufInfo.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    cmdBufInfo.commandBufferCount = 1;

    VkCommandBuffer cmdBuf;
    vkAllocateCommandBuffers(device, &cmdBufInfo, &cmdBuf);

    VkCommandBufferBeginInfo beginInfo{};
    beginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
    beginInfo.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;

    vkBeginCommandBuffer(cmdBuf, &beginInfo);
    vkCmdBindPipeline(cmdBuf, VK_PIPELINE_BIND_POINT_COMPUTE, pipeline);
    vkCmdBindDescriptorSets(cmdBuf, VK_PIPELINE_BIND_POINT_COMPUTE,
                            pipelineLayout, 0, 1, &descSet, 0, nullptr);
    vkCmdPushConstants(cmdBuf, pipelineLayout,
                       VK_SHADER_STAGE_COMPUTE_BIT, 0, sizeof(uint32_t), &N);
    vkCmdDispatch(cmdBuf, (N + 255) / 256, 1, 1);  // Dispatch workgroups
    vkEndCommandBuffer(cmdBuf);

    // ========================================
    // 12. SUBMIT AND WAIT
    // ========================================
    VkFenceCreateInfo fenceInfo{};
    fenceInfo.sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;
    VkFence fence;
    vkCreateFence(device, &fenceInfo, nullptr, &fence);

    VkSubmitInfo submitInfo{};
    submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    submitInfo.commandBufferCount = 1;
    submitInfo.pCommandBuffers = &cmdBuf;

    vkQueueSubmit(computeQueue, 1, &submitInfo, fence);
    vkWaitForFences(device, 1, &fence, VK_TRUE, UINT64_MAX);

    // ========================================
    // 13. READ AND VERIFY RESULTS
    // ========================================
    float* ptrC;
    vkMapMemory(device, memC, 0, bufferSize, 0, (void**)&ptrC);
    bool correct = true;
    for (uint32_t i = 0; i < N && correct; i++) {
        if (ptrC[i] != (float)i + (float)(i * 2)) {
            correct = false;
        }
    }
    vkUnmapMemory(device, memC);
    printf("Result: %s\n", correct ? "PASS" : "FAIL");

    // ========================================
    // 14. CLEANUP (omitted for brevity, but every Vk object
    //     must be destroyed in reverse creation order)
    // ========================================
    vkDestroyFence(device, fence, nullptr);
    vkDestroyCommandPool(device, cmdPool, nullptr);
    vkDestroyPipeline(device, pipeline, nullptr);
    vkDestroyShaderModule(device, shaderModule, nullptr);
    vkDestroyPipelineLayout(device, pipelineLayout, nullptr);
    vkDestroyDescriptorPool(device, descPool, nullptr);
    vkDestroyDescriptorSetLayout(device, descSetLayout, nullptr);
    vkDestroyBuffer(device, bufA, nullptr);
    vkDestroyBuffer(device, bufB, nullptr);
    vkDestroyBuffer(device, bufC, nullptr);
    vkFreeMemory(device, memA, nullptr);
    vkFreeMemory(device, memB, nullptr);
    vkFreeMemory(device, memC, nullptr);
    vkDestroyDevice(device, nullptr);
    vkDestroyInstance(instance, nullptr);

    return 0;
}
```

The verbosity is extreme, roughly 250 lines for vector addition. But every line gives you control over exactly what the GPU does. For production compute workloads, this control matters.

---

## 3. SYCL and oneAPI

SYCL (pronounced "sickle") is a Khronos standard for heterogeneous computing that uses standard C++. Intel's oneAPI initiative is built on SYCL, using the DPC++ (Data Parallel C++) compiler. SYCL represents the modern approach: write standard C++, run on any accelerator.

### SYCL Architecture

```
SYCL ARCHITECTURE

+------------------------------------------------------+
|  APPLICATION CODE (Standard C++)                      |
|                                                        |
|  sycl::queue q;                                       |
|  q.submit([&](sycl::handler& h) {                    |
|      h.parallel_for(range, [=](sycl::id<1> i) {      |
|          // This lambda runs on the device             |
|          C[i] = A[i] + B[i];                          |
|      });                                               |
|  });                                                   |
+------------------------------------------------------+
         |
    +----+----+----+----+
    |         |         |
+--------+ +--------+ +--------+
|NVIDIA  | | AMD    | | Intel  |
|Backend | | Backend| | Backend|
|(CUDA)  | | (HIP)  | | (L0)  |
+--------+ +--------+ +--------+
    |         |         |
+--------+ +--------+ +--------+
|GeForce | | Radeon | | Arc    |
|Tesla   | | MI300  | | Xe     |
+--------+ +--------+ +--------+

Compilers:
  Intel DPC++  (icpx) - Intel's SYCL implementation
  AdaptiveCpp  (formerly hipSYCL) - Open source, multi-backend
  ComputeCpp   (Codeplay) - Commercial implementation
```

### SYCL Memory Models

SYCL offers two memory management approaches:

```
BUFFER/ACCESSOR MODEL (SYCL 1.2.1+)

  Host Data                   Device
  +--------+                  +--------+
  | float* | -- buffer --> | auto    |
  | h_data |    wraps it      | managed|
  +--------+                  +--------+
                              accessor reads/writes
  Automatic data movement, dependency tracking

USM MODEL (Unified Shared Memory, SYCL 2020)

  Three allocation types:
  +----------------------------------------------------------+
  | Device allocation:  malloc_device(N, queue)               |
  |   Lives on device, explicit copy needed                   |
  |                                                            |
  | Host allocation:    malloc_host(N, queue)                  |
  |   Lives on host, accessible from device (slow)            |
  |                                                            |
  | Shared allocation:  malloc_shared(N, queue)                |
  |   Migrates automatically between host and device           |
  |   (like CUDA Unified Memory)                               |
  +----------------------------------------------------------+
```

### Complete SYCL Vector Addition (Buffer/Accessor Model)

```cpp
// vector_add_sycl_buffer.cpp
// Compile: icpx -fsycl -o vector_add vector_add_sycl_buffer.cpp

#include <sycl/sycl.hpp>
#include <vector>
#include <iostream>

int main() {
    const size_t N = 1024 * 1024;

    // Host data
    std::vector<float> h_A(N), h_B(N), h_C(N);
    for (size_t i = 0; i < N; i++) {
        h_A[i] = static_cast<float>(i);
        h_B[i] = static_cast<float>(i * 2);
    }

    // Create a queue (selects default device: GPU > CPU)
    sycl::queue q{sycl::gpu_selector_v};
    std::cout << "Device: "
              << q.get_device().get_info<sycl::info::device::name>()
              << std::endl;

    {
        // Create SYCL buffers wrapping host data
        // The buffer lifetime controls when data is written back
        sycl::buffer<float, 1> buf_A(h_A.data(), sycl::range<1>(N));
        sycl::buffer<float, 1> buf_B(h_B.data(), sycl::range<1>(N));
        sycl::buffer<float, 1> buf_C(h_C.data(), sycl::range<1>(N));

        // Submit kernel to the queue
        q.submit([&](sycl::handler& h) {
            // Create accessors (determine data movement direction)
            auto a = buf_A.get_access<sycl::access::mode::read>(h);
            auto b = buf_B.get_access<sycl::access::mode::read>(h);
            auto c = buf_C.get_access<sycl::access::mode::write>(h);

            // Launch parallel kernel
            h.parallel_for(sycl::range<1>(N), [=](sycl::id<1> i) {
                c[i] = a[i] + b[i];
            });
        });
        // Buffer destructor blocks until kernel completes
        // and copies data back to h_C
    }

    // Verify results
    bool correct = true;
    for (size_t i = 0; i < N; i++) {
        if (h_C[i] != h_A[i] + h_B[i]) {
            correct = false;
            break;
        }
    }
    std::cout << "Result: " << (correct ? "PASS" : "FAIL") << std::endl;

    return 0;
}
```

### SYCL Vector Addition with USM

```cpp
// vector_add_sycl_usm.cpp
// Compile: icpx -fsycl -o vector_add_usm vector_add_sycl_usm.cpp

#include <sycl/sycl.hpp>
#include <iostream>

int main() {
    const size_t N = 1024 * 1024;

    sycl::queue q{sycl::gpu_selector_v};

    // Allocate shared memory (accessible from host and device)
    float* A = sycl::malloc_shared<float>(N, q);
    float* B = sycl::malloc_shared<float>(N, q);
    float* C = sycl::malloc_shared<float>(N, q);

    // Initialize on host
    for (size_t i = 0; i < N; i++) {
        A[i] = static_cast<float>(i);
        B[i] = static_cast<float>(i * 2);
    }

    // Submit kernel
    q.parallel_for(sycl::range<1>(N), [=](sycl::id<1> i) {
        C[i] = A[i] + B[i];
    }).wait();  // Explicit wait since we're using USM

    // Verify
    bool correct = true;
    for (size_t i = 0; i < N; i++) {
        if (C[i] != A[i] + B[i]) {
            correct = false;
            break;
        }
    }
    std::cout << "Result: " << (correct ? "PASS" : "FAIL") << std::endl;

    // Free USM memory
    sycl::free(A, q);
    sycl::free(B, q);
    sycl::free(C, q);

    return 0;
}
```

### SYCL Matrix Multiply with Work-Groups

```cpp
// mat_mul_sycl.cpp
// Compile: icpx -fsycl -o mat_mul mat_mul_sycl.cpp

#include <sycl/sycl.hpp>
#include <iostream>
#include <vector>

constexpr int TILE_SIZE = 16;

int main() {
    const int M = 1024, N = 1024, K = 1024;

    std::vector<float> h_A(M * K), h_B(K * N), h_C(M * N, 0.0f);

    // Initialize matrices
    for (int i = 0; i < M * K; i++) h_A[i] = 1.0f;
    for (int i = 0; i < K * N; i++) h_B[i] = 1.0f;

    sycl::queue q{sycl::gpu_selector_v};

    {
        sycl::buffer<float, 2> buf_A(h_A.data(), sycl::range<2>(M, K));
        sycl::buffer<float, 2> buf_B(h_B.data(), sycl::range<2>(K, N));
        sycl::buffer<float, 2> buf_C(h_C.data(), sycl::range<2>(M, N));

        q.submit([&](sycl::handler& h) {
            auto A = buf_A.get_access<sycl::access::mode::read>(h);
            auto B = buf_B.get_access<sycl::access::mode::read>(h);
            auto C = buf_C.get_access<sycl::access::mode::write>(h);

            // Local (shared) memory for tiles
            sycl::local_accessor<float, 2>
                tileA(sycl::range<2>(TILE_SIZE, TILE_SIZE), h);
            sycl::local_accessor<float, 2>
                tileB(sycl::range<2>(TILE_SIZE, TILE_SIZE), h);

            h.parallel_for(
                sycl::nd_range<2>(
                    sycl::range<2>(M, N),                    // global
                    sycl::range<2>(TILE_SIZE, TILE_SIZE)     // local
                ),
                [=](sycl::nd_item<2> item) {
                    int row = item.get_local_id(0);
                    int col = item.get_local_id(1);
                    int globalRow = item.get_global_id(0);
                    int globalCol = item.get_global_id(1);

                    float sum = 0.0f;

                    for (int t = 0; t < K / TILE_SIZE; t++) {
                        // Load tiles into local memory
                        tileA[row][col] = A[globalRow][t * TILE_SIZE + col];
                        tileB[row][col] = B[t * TILE_SIZE + row][globalCol];

                        // Synchronize work-group
                        item.barrier(sycl::access::fence_space::local_space);

                        for (int k = 0; k < TILE_SIZE; k++) {
                            sum += tileA[row][k] * tileB[k][col];
                        }

                        item.barrier(sycl::access::fence_space::local_space);
                    }

                    C[globalRow][globalCol] = sum;
                }
            );
        });
    }

    std::cout << "C[0][0] = " << h_C[0] << " (expected " << K << ")"
              << std::endl;

    return 0;
}
```

### CUDA vs. SYCL Comparison

```
FEATURE                 CUDA                    SYCL
-------                 ----                    ----
Language                C++ extensions          Standard C++ (lambdas)
Kernel syntax           __global__ void fn()    parallel_for(range, lambda)
Thread index            threadIdx.x             item.get_local_id(0)
Block index             blockIdx.x              item.get_group(0)
Shared memory           __shared__ float s[]    local_accessor<float>
Synchronization         __syncthreads()         item.barrier(...)
Memory allocation       cudaMalloc()            malloc_device() / buffers
Data transfer           cudaMemcpy()            Automatic (buffers) / memcpy
Error handling          cudaError_t             C++ exceptions
Vendor support          NVIDIA only             NVIDIA, AMD, Intel, FPGA
Compiler                nvcc                    icpx -fsycl / acpp
Ecosystem maturity      Very mature             Growing rapidly
```

---

## 4. Apple Metal Compute

Metal is Apple's GPU API, available on macOS, iOS, iPadOS, and tvOS. Since Apple dropped OpenCL support, Metal is the only way to access Apple GPUs (M1, M2, M3, M4 chips and the discrete GPUs in older Macs).

### Metal Compute Architecture

```
METAL COMPUTE PIPELINE

  Host (CPU - Objective-C++ or Swift)
  +--------------------------------------------------+
  |  MTLDevice          - represents the GPU          |
  |  MTLCommandQueue    - serial queue of cmd buffers |
  |  MTLCommandBuffer   - batch of encoded commands   |
  |  MTLComputeEncoder  - encodes compute commands    |
  |  MTLComputePipeline - compiled compute function   |
  |  MTLBuffer          - GPU-accessible memory       |
  |  MTLLibrary         - collection of functions     |
  +--------------------------------------------------+

  Metal Shading Language (MSL) Kernel
  +--------------------------------------------------+
  |  kernel void my_kernel(                           |
  |      device float* A [[buffer(0)]],               |
  |      device float* B [[buffer(1)]],               |
  |      uint id [[thread_position_in_grid]]          |
  |  ) { ... }                                        |
  +--------------------------------------------------+

  APPLE SILICON UNIFIED MEMORY
  +--------------------------------------------------+
  |  CPU and GPU share the SAME physical memory       |
  |  No need to copy data between host and device     |
  |  MTLBuffer with storageModeShared                 |
  |  Just write on CPU, dispatch on GPU, read on CPU  |
  +--------------------------------------------------+
```

### Metal Shading Language Kernel

```metal
// vector_add.metal
// Metal Shading Language (MSL) is based on C++14

#include <metal_stdlib>
using namespace metal;

kernel void vector_add(
    device const float* A [[buffer(0)]],
    device const float* B [[buffer(1)]],
    device float* C       [[buffer(2)]],
    constant uint& N      [[buffer(3)]],
    uint id               [[thread_position_in_grid]])
{
    if (id < N) {
        C[id] = A[id] + B[id];
    }
}

// Matrix multiply with threadgroup (shared) memory
kernel void mat_mul(
    device const float* A  [[buffer(0)]],
    device const float* B  [[buffer(1)]],
    device float* C        [[buffer(2)]],
    constant uint& M       [[buffer(3)]],
    constant uint& N       [[buffer(4)]],
    constant uint& K       [[buffer(5)]],
    uint2 gid              [[thread_position_in_grid]],
    uint2 tid              [[thread_position_in_threadgroup]],
    uint2 tgSize           [[threads_per_threadgroup]])
{
    // Threadgroup (shared) memory for tiling
    threadgroup float tileA[16][16];
    threadgroup float tileB[16][16];

    float sum = 0.0f;
    uint row = gid.y;
    uint col = gid.x;

    for (uint t = 0; t < (K + 15) / 16; t++) {
        // Load tiles
        uint tiledCol = t * 16 + tid.x;
        uint tiledRow = t * 16 + tid.y;

        tileA[tid.y][tid.x] = (row < M && tiledCol < K)
            ? A[row * K + tiledCol] : 0.0f;
        tileB[tid.y][tid.x] = (tiledRow < K && col < N)
            ? B[tiledRow * N + col] : 0.0f;

        threadgroup_barrier(mem_flags::mem_threadgroup);

        for (uint k = 0; k < 16; k++) {
            sum += tileA[tid.y][k] * tileB[k][tid.x];
        }

        threadgroup_barrier(mem_flags::mem_threadgroup);
    }

    if (row < M && col < N) {
        C[row * N + col] = sum;
    }
}
```

### Complete Metal Host Code (Objective-C++)

```objc
// metal_compute.mm
// Compile: clang++ -o metal_compute metal_compute.mm
//          -framework Metal -framework Foundation

#import <Metal/Metal.h>
#import <Foundation/Foundation.h>
#include <cstdio>

int main() {
    @autoreleasepool {
        const uint32_t N = 1024 * 1024;
        const size_t bufferSize = N * sizeof(float);

        // ========================================
        // 1. GET THE GPU DEVICE
        // ========================================
        id<MTLDevice> device = MTLCreateSystemDefaultDevice();
        if (!device) {
            fprintf(stderr, "Metal is not supported on this device\n");
            return 1;
        }
        NSLog(@"Using device: %@", device.name);

        // ========================================
        // 2. LOAD THE SHADER LIBRARY
        // ========================================
        NSError* error = nil;

        // Load from a .metal file compiled into a .metallib
        // Or compile from source string at runtime:
        NSString* shaderSrc = @
            "#include <metal_stdlib>\n"
            "using namespace metal;\n"
            "kernel void vector_add(\n"
            "    device const float* A [[buffer(0)]],\n"
            "    device const float* B [[buffer(1)]],\n"
            "    device float* C       [[buffer(2)]],\n"
            "    constant uint& N      [[buffer(3)]],\n"
            "    uint id [[thread_position_in_grid]])\n"
            "{\n"
            "    if (id < N) { C[id] = A[id] + B[id]; }\n"
            "}\n";

        id<MTLLibrary> library = [device
            newLibraryWithSource:shaderSrc
            options:nil
            error:&error];

        if (!library) {
            NSLog(@"Failed to compile shader: %@", error);
            return 1;
        }

        // ========================================
        // 3. CREATE COMPUTE PIPELINE
        // ========================================
        id<MTLFunction> function =
            [library newFunctionWithName:@"vector_add"];
        id<MTLComputePipelineState> pipeline =
            [device newComputePipelineStateWithFunction:function
                    error:&error];

        if (!pipeline) {
            NSLog(@"Failed to create pipeline: %@", error);
            return 1;
        }

        // ========================================
        // 4. CREATE BUFFERS (shared memory on Apple Silicon)
        // ========================================
        // storageModeShared: CPU and GPU can both access
        // On Apple Silicon, this is zero-copy (same physical memory)
        id<MTLBuffer> bufA = [device newBufferWithLength:bufferSize
                              options:MTLResourceStorageModeShared];
        id<MTLBuffer> bufB = [device newBufferWithLength:bufferSize
                              options:MTLResourceStorageModeShared];
        id<MTLBuffer> bufC = [device newBufferWithLength:bufferSize
                              options:MTLResourceStorageModeShared];
        id<MTLBuffer> bufN = [device newBufferWithLength:sizeof(uint32_t)
                              options:MTLResourceStorageModeShared];

        // ========================================
        // 5. FILL INPUT BUFFERS
        // ========================================
        float* ptrA = (float*)[bufA contents];
        float* ptrB = (float*)[bufB contents];
        uint32_t* ptrN = (uint32_t*)[bufN contents];

        for (uint32_t i = 0; i < N; i++) {
            ptrA[i] = (float)i;
            ptrB[i] = (float)(i * 2);
        }
        *ptrN = N;

        // ========================================
        // 6. CREATE COMMAND QUEUE AND BUFFER
        // ========================================
        id<MTLCommandQueue> commandQueue = [device newCommandQueue];
        id<MTLCommandBuffer> commandBuffer = [commandQueue commandBuffer];
        id<MTLComputeCommandEncoder> encoder =
            [commandBuffer computeCommandEncoder];

        // ========================================
        // 7. ENCODE COMPUTE COMMAND
        // ========================================
        [encoder setComputePipelineState:pipeline];
        [encoder setBuffer:bufA offset:0 atIndex:0];
        [encoder setBuffer:bufB offset:0 atIndex:1];
        [encoder setBuffer:bufC offset:0 atIndex:2];
        [encoder setBuffer:bufN offset:0 atIndex:3];

        // Calculate thread configuration
        NSUInteger threadGroupSize = pipeline.maxTotalThreadsPerThreadgroup;
        if (threadGroupSize > 256) threadGroupSize = 256;

        MTLSize gridSize = MTLSizeMake(N, 1, 1);
        MTLSize groupSize = MTLSizeMake(threadGroupSize, 1, 1);

        [encoder dispatchThreads:gridSize
                 threadsPerThreadgroup:groupSize];
        [encoder endEncoding];

        // ========================================
        // 8. SUBMIT AND WAIT
        // ========================================
        [commandBuffer commit];
        [commandBuffer waitUntilCompleted];

        // ========================================
        // 9. VERIFY RESULTS (direct access - no copy needed)
        // ========================================
        float* ptrC = (float*)[bufC contents];
        bool correct = true;
        for (uint32_t i = 0; i < N; i++) {
            if (ptrC[i] != ptrA[i] + ptrB[i]) {
                correct = false;
                break;
            }
        }
        printf("Result: %s\n", correct ? "PASS" : "FAIL");
    }
    return 0;
}
```

### Metal Advantages on Apple Silicon

```
APPLE SILICON UNIFIED MEMORY ARCHITECTURE (UMA)

Traditional (Discrete GPU):
  CPU RAM  ----PCIe bus---->  GPU VRAM
  Copy in                     Copy out
  High latency for transfers

Apple Silicon (UMA):
  +----------------------------------+
  |  UNIFIED MEMORY (LPDDR5)         |
  |                                   |
  |  CPU Cluster    GPU Cluster      |
  |  reads/writes   reads/writes     |
  |  SAME memory    SAME memory      |
  |                                   |
  |  No copy needed!                 |
  |  storageModeShared = zero-copy   |
  +----------------------------------+

Benefits:
  - No PCIe bottleneck
  - Zero-copy data sharing
  - Lower power consumption
  - Simplified programming model
  - Up to 192 GB unified memory (M2 Ultra / M4 Ultra)
```

---

## 5. WebGPU and WGSL

WebGPU is the next-generation GPU API for the web, replacing WebGL. It exposes modern GPU features including compute shaders. WebGPU is available in Chrome, Edge, and Firefox, and also has native implementations (wgpu in Rust, Dawn in C++) that run outside the browser.

### WebGPU Architecture

```
WEBGPU ARCHITECTURE

Browser Environment:
+-----------------------------------------------------+
|  JavaScript / TypeScript Application                 |
|                                                       |
|  navigator.gpu.requestAdapter()                      |
|       |                                               |
|  adapter.requestDevice()                              |
|       |                                               |
|  GPUDevice                                            |
|    |-- createBuffer()          -> GPUBuffer           |
|    |-- createShaderModule()    -> GPUShaderModule     |
|    |-- createBindGroupLayout() -> GPUBindGroupLayout  |
|    |-- createComputePipeline() -> GPUComputePipeline  |
|    |-- createCommandEncoder()  -> GPUCommandEncoder   |
|    |-- queue.submit()          (execute commands)     |
+-----------------------------------------------------+
         |
  +------+------+------+
  |             |       |
+------+  +------+  +------+
|Vulkan|  | D3D12|  | Metal|
|      |  |      |  |      |
+------+  +------+  +------+
  Linux    Windows    macOS
  Android            iOS

WGSL (WebGPU Shading Language):
  - Designed specifically for WebGPU
  - Rust-like syntax with explicit types
  - Replaces GLSL/HLSL in the browser
  - Validated at compile time for safety
```

### Complete WebGPU Compute Example

```javascript
// webgpu_compute.js
// Run in a browser with WebGPU support (Chrome 113+)

async function main() {
  // ========================================
  // 1. INITIALIZE WebGPU
  // ========================================
  if (!navigator.gpu) {
    console.error('WebGPU not supported in this browser');
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    console.error('No GPU adapter found');
    return;
  }

  const device = await adapter.requestDevice();
  console.log('Using adapter:', adapter.info?.device || 'GPU');

  // ========================================
  // 2. CREATE BUFFERS
  // ========================================
  const N = 1024 * 1024;
  const bufferSize = N * Float32Array.BYTES_PER_ELEMENT;

  // Input arrays
  const inputA = new Float32Array(N);
  const inputB = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    inputA[i] = i;
    inputB[i] = i * 2;
  }

  // Create GPU buffers
  const gpuBufferA = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(gpuBufferA.getMappedRange()).set(inputA);
  gpuBufferA.unmap();

  const gpuBufferB = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(gpuBufferB.getMappedRange()).set(inputB);
  gpuBufferB.unmap();

  // Output buffer (GPU-side)
  const gpuBufferC = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // Staging buffer for reading results back to CPU
  const stagingBuffer = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // Uniform buffer for N
  const uniformBuffer = device.createBuffer({
    size: 4, // uint32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([N]));

  // ========================================
  // 3. CREATE COMPUTE SHADER (WGSL)
  // ========================================
  const shaderModule = device.createShaderModule({
    code: `
            @group(0) @binding(0) var<storage, read> A: array<f32>;
            @group(0) @binding(1) var<storage, read> B: array<f32>;
            @group(0) @binding(2) var<storage, read_write> C: array<f32>;
            @group(0) @binding(3) var<uniform> N: u32;

            @compute @workgroup_size(256)
            fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
                let i = gid.x;
                if (i < N) {
                    C[i] = A[i] + B[i];
                }
            }
        `,
  });

  // ========================================
  // 4. CREATE BIND GROUP LAYOUT AND PIPELINE
  // ========================================
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: shaderModule,
      entryPoint: 'main',
    },
  });

  // ========================================
  // 5. CREATE BIND GROUP
  // ========================================
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: gpuBufferA } },
      { binding: 1, resource: { buffer: gpuBufferB } },
      { binding: 2, resource: { buffer: gpuBufferC } },
      { binding: 3, resource: { buffer: uniformBuffer } },
    ],
  });

  // ========================================
  // 6. ENCODE AND SUBMIT COMMANDS
  // ========================================
  const encoder = device.createCommandEncoder();

  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(N / 256));
  pass.end();

  // Copy result to staging buffer for CPU access
  encoder.copyBufferToBuffer(gpuBufferC, 0, stagingBuffer, 0, bufferSize);

  device.queue.submit([encoder.finish()]);

  // ========================================
  // 7. READ RESULTS
  // ========================================
  await stagingBuffer.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(stagingBuffer.getMappedRange());

  // Verify
  let correct = true;
  for (let i = 0; i < N; i++) {
    if (result[i] !== inputA[i] + inputB[i]) {
      correct = false;
      break;
    }
  }
  console.log(`Result: ${correct ? 'PASS' : 'FAIL'}`);

  stagingBuffer.unmap();
}

main();
```

### WGSL Language Features

```wgsl
// WGSL (WebGPU Shading Language) - key features

// ============================================
// Types
// ============================================
// Scalars: bool, i32, u32, f32, f16 (with extension)
// Vectors: vec2<f32>, vec3<u32>, vec4<i32>
// Matrices: mat2x2<f32>, mat3x3<f32>, mat4x4<f32>
// Arrays: array<f32, 16> (fixed), array<f32> (runtime-sized)

// ============================================
// Structures
// ============================================
struct Particle {
    position: vec3<f32>,
    velocity: vec3<f32>,
    mass: f32,
}

// ============================================
// Address spaces
// ============================================
// var<private>     - per-invocation (registers)
// var<workgroup>   - shared within workgroup (like shared memory)
// var<uniform>     - read-only, uniform across invocations
// var<storage>     - read/write device memory

// ============================================
// Compute shader with workgroup shared memory
// ============================================
var<workgroup> shared_data: array<f32, 256>;

@compute @workgroup_size(256)
fn reduce(@builtin(local_invocation_id) lid: vec3<u32>,
          @builtin(workgroup_id) wid: vec3<u32>) {

    let local_idx = lid.x;
    let global_idx = wid.x * 256u + lid.x;

    // Load data into shared memory
    shared_data[local_idx] = input_data[global_idx];
    workgroupBarrier();

    // Parallel reduction
    var stride = 128u;
    loop {
        if stride == 0u { break; }
        if local_idx < stride {
            shared_data[local_idx] =
                shared_data[local_idx] + shared_data[local_idx + stride];
        }
        workgroupBarrier();
        stride = stride >> 1u;
    }

    // Write result
    if local_idx == 0u {
        output[wid.x] = shared_data[0];
    }
}
```

---

## 6. HIP (AMD ROCm)

HIP (Heterogeneous-Compute Interface for Portability) is AMD's answer to CUDA. It provides a CUDA-like API that runs on AMD GPUs natively and can also target NVIDIA GPUs through a thin translation layer. The key insight: if you already know CUDA, you already know HIP.

### HIP Architecture and ROCm Ecosystem

```
ROCm (Radeon Open Compute) ECOSYSTEM

+-----------------------------------------------------------+
|  APPLICATION LAYER                                         |
|  +----------+ +----------+ +-----------+ +-------------+  |
|  | PyTorch  | | TensorFlow| | hipBLAS   | | User Code   |  |
|  | (ROCm)   | | (ROCm)   | | hipFFT    | | (HIP C++)   |  |
|  +----------+ +----------+ +-----------+ +-------------+  |
+-----------------------------------------------------------+
|  HIP RUNTIME API                                           |
|  hipMalloc, hipMemcpy, hipLaunchKernel, hipStream, ...    |
+-----------------------------------------------------------+
         |                              |
    +----+----+                    +----+----+
    | AMD GPU |                    | NVIDIA  |
    | (native)|                    | (via    |
    | ROCr    |                    |  CUDA   |
    +---------+                    |  trans- |
    | MI300X  |                    |  lation)|
    | MI250X  |                    +---------+
    | RX 7900 |
    +---------+

HIPIFY TOOL:
  Converts CUDA source code to HIP source code
  hipify-perl / hipify-clang

  cudaMalloc     -> hipMalloc
  cudaMemcpy     -> hipMemcpy
  __syncthreads  -> __syncthreads  (same!)
  <<<grid,blk>>> -> hipLaunchKernelGGL or <<<grid,blk>>>
```

### CUDA to HIP Translation

The mapping is nearly 1:1:

```
CUDA -> HIP TRANSLATION TABLE

CUDA API                          HIP API
--------                          -------
cudaMalloc                        hipMalloc
cudaFree                          hipFree
cudaMemcpy                        hipMemcpy
cudaMemcpyHostToDevice            hipMemcpyHostToDevice
cudaMemcpyDeviceToHost            hipMemcpyDeviceToHost
cudaDeviceSynchronize             hipDeviceSynchronize
cudaGetDeviceCount                hipGetDeviceCount
cudaSetDevice                     hipSetDevice
cudaGetDeviceProperties           hipGetDeviceProperties

cudaStream_t                      hipStream_t
cudaStreamCreate                  hipStreamCreate
cudaStreamSynchronize             hipStreamSynchronize
cudaStreamDestroy                 hipStreamDestroy

cudaEvent_t                       hipEvent_t
cudaEventCreate                   hipEventCreate
cudaEventRecord                   hipEventRecord
cudaEventElapsedTime              hipEventElapsedTime

cudaError_t                       hipError_t
cudaSuccess                       hipSuccess
cudaGetErrorString                hipGetErrorString

__global__                        __global__    (same)
__device__                        __device__    (same)
__shared__                        __shared__    (same)
__syncthreads()                   __syncthreads() (same)
threadIdx.x                       threadIdx.x   (same, via HIP macros)
blockIdx.x                        blockIdx.x    (same)
blockDim.x                        blockDim.x    (same)
gridDim.x                         gridDim.x     (same)

atomicAdd                         atomicAdd     (same)
__shfl_sync                       __shfl        (slight differences)
```

### Complete HIP Vector Addition

```cpp
// vector_add_hip.cpp
// Compile (AMD): hipcc -o vector_add vector_add_hip.cpp
// Compile (NVIDIA): hipcc --platform nvidia -o vector_add vector_add_hip.cpp

#include <hip/hip_runtime.h>
#include <cstdio>
#include <cstdlib>

// Kernel - identical syntax to CUDA
__global__ void vector_add(const float* A, const float* B,
                           float* C, int N) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < N) {
        C[i] = A[i] + B[i];
    }
}

// Error checking macro (same pattern as CUDA)
#define HIP_CHECK(call)                                          \
    do {                                                          \
        hipError_t err = call;                                    \
        if (err != hipSuccess) {                                  \
            fprintf(stderr, "HIP error at %s:%d: %s\n",          \
                    __FILE__, __LINE__, hipGetErrorString(err));   \
            exit(1);                                               \
        }                                                          \
    } while (0)

int main() {
    const int N = 1024 * 1024;
    const size_t bytes = N * sizeof(float);

    // Print device info
    hipDeviceProp_t prop;
    HIP_CHECK(hipGetDeviceProperties(&prop, 0));
    printf("Device: %s\n", prop.name);
    printf("Compute units: %d\n", prop.multiProcessorCount);
    printf("Max threads/block: %d\n", prop.maxThreadsPerBlock);

    // Allocate host memory
    float *h_A = (float*)malloc(bytes);
    float *h_B = (float*)malloc(bytes);
    float *h_C = (float*)malloc(bytes);

    for (int i = 0; i < N; i++) {
        h_A[i] = (float)i;
        h_B[i] = (float)(i * 2);
    }

    // Allocate device memory
    float *d_A, *d_B, *d_C;
    HIP_CHECK(hipMalloc(&d_A, bytes));
    HIP_CHECK(hipMalloc(&d_B, bytes));
    HIP_CHECK(hipMalloc(&d_C, bytes));

    // Copy to device
    HIP_CHECK(hipMemcpy(d_A, h_A, bytes, hipMemcpyHostToDevice));
    HIP_CHECK(hipMemcpy(d_B, h_B, bytes, hipMemcpyHostToDevice));

    // Launch kernel (identical syntax to CUDA)
    int blockSize = 256;
    int gridSize = (N + blockSize - 1) / blockSize;

    // Method 1: CUDA-style triple-chevron syntax
    vector_add<<<gridSize, blockSize>>>(d_A, d_B, d_C, N);
    HIP_CHECK(hipGetLastError());

    // Method 2: HIP-specific launch macro (more portable)
    // hipLaunchKernelGGL(vector_add,
    //     dim3(gridSize), dim3(blockSize), 0, 0,
    //     d_A, d_B, d_C, N);

    // Copy result back
    HIP_CHECK(hipMemcpy(h_C, d_C, bytes, hipMemcpyDeviceToHost));

    // Verify
    bool correct = true;
    for (int i = 0; i < N; i++) {
        if (h_C[i] != h_A[i] + h_B[i]) {
            correct = false;
            break;
        }
    }
    printf("Result: %s\n", correct ? "PASS" : "FAIL");

    // Cleanup
    HIP_CHECK(hipFree(d_A));
    HIP_CHECK(hipFree(d_B));
    HIP_CHECK(hipFree(d_C));
    free(h_A);
    free(h_B);
    free(h_C);

    return 0;
}
```

### Using hipify to Convert CUDA Code

```bash
# Convert a single CUDA file to HIP
hipify-perl cuda_program.cu > hip_program.cpp

# Convert an entire project
hipify-perl --inplace --print-stats /path/to/cuda/project/

# Example conversion (what hipify does):
# Before (CUDA):
#   cudaMalloc(&d_ptr, size);
#   kernel<<<grid, block>>>(d_ptr, N);
#   cudaDeviceSynchronize();
#
# After (HIP):
#   hipMalloc(&d_ptr, size);
#   kernel<<<grid, block>>>(d_ptr, N);   // triple-chevron preserved
#   hipDeviceSynchronize();
```

### HIP-Specific Features

```cpp
// HIP warp-level primitives (AMD wavefront = 64 threads by default)

// Wave size detection (critical difference from CUDA)
// AMD: wavefront = 64 by default (can be 32 on RDNA)
// NVIDIA: warp = 32 always
#include <hip/hip_runtime.h>

__global__ void warp_reduce(float* data, float* result) {
    float val = data[threadIdx.x];

    // HIP uses warpSize built-in (64 on CDNA, 32 on RDNA)
    for (int offset = warpSize / 2; offset > 0; offset /= 2) {
        val += __shfl_down(val, offset);
    }

    if (threadIdx.x == 0) {
        result[0] = val;
    }
}

// Compile-time wavefront size control
// hipcc --gpu-architecture=gfx90a  (MI250X, wavefront 64)
// hipcc --gpu-architecture=gfx1100 (RX 7900, wavefront 32)
```

---

## 7. Comparison Matrix

### Feature Comparison Table

```
+============+=========+=========+=========+=========+=========+=========+=========+
| Feature    | CUDA    | OpenCL  | Vulkan  | SYCL    | Metal   | WebGPU  | HIP     |
+============+=========+=========+=========+=========+=========+=========+=========+
| Vendor     | NVIDIA  | Khronos | Khronos | Khronos | Apple   | W3C     | AMD     |
|            | only    | (all)   | (all)   | (all*)  | only    | (all)   | (+NV)   |
+------------+---------+---------+---------+---------+---------+---------+---------+
| Language   | C++/    | OpenCL  | GLSL/   | C++17   | MSL     | WGSL    | C++/    |
| (kernel)   | CUDA    | C       | HLSL    | lambdas | (C++14) |         | HIP     |
|            |         | (C99)   | ->SPIRV |         |         |         |         |
+------------+---------+---------+---------+---------+---------+---------+---------+
| Language   | C/C++   | C/C++   | C/C++   | C++17   | ObjC/   | JS/TS   | C/C++   |
| (host)     |         |         |         |         | Swift   |         |         |
+------------+---------+---------+---------+---------+---------+---------+---------+
| Kernel     | Compile | Runtime | Pre-    | Compile | Compile | Runtime | Compile |
| compila-   | time    | JIT     | compiled| time    | time or | (WGSL   | time    |
| tion       | (nvcc)  |         | SPIR-V  | (icpx)  | runtime | valid-  | (hipcc) |
|            |         |         |         |         |         | ated)   |         |
+------------+---------+---------+---------+---------+---------+---------+---------+
| Verbosity  | Low     | High    | Extreme | Very    | Medium  | Medium- | Low     |
|            | ~20     | ~100    | ~300    | Low     | ~60     | High    | ~20     |
|            | lines*  | lines*  | lines*  | ~15     | lines*  | ~80     | lines*  |
|            |         |         |         | lines*  |         | lines*  |         |
+------------+---------+---------+---------+---------+---------+---------+---------+
| Shared     | Yes     | Yes     | Yes     | Yes     | Yes     | Yes     | Yes     |
| memory     |         |         | (sub-   |         | (thread |         |         |
|            |         |         | group)  |         | group)  |         |         |
+------------+---------+---------+---------+---------+---------+---------+---------+
| Unified    | Yes     | SVM     | No (can | Yes     | Yes     | No      | Yes     |
| memory     | (6.0+)  | (2.0+)  | use     | (USM)   | (UMA on |         |         |
|            |         |         | host-   |         | Apple   |         |         |
|            |         |         | visible)|         | Silicon)|         |         |
+------------+---------+---------+---------+---------+---------+---------+---------+
| Async      | Streams | Command | Command | Queues  | Command | Command | Streams |
| execution  |         | Queues  | Buffers | + Events| Queue   | Queue   |         |
+------------+---------+---------+---------+---------+---------+---------+---------+
| Debugging  | Nsight  | Vendor- | Render  | Intel   | Xcode   | Browser | ROCm    |
| tools      | Systems | specific| Doc /   | VTune / | GPU     | DevTools| debug   |
|            | + Comp  |         | valid.  | oneAPI  | debugger|         | tools   |
|            |         |         | layers  | tools   |         |         |         |
+------------+---------+---------+---------+---------+---------+---------+---------+
| Platform   | Linux   | Linux   | Linux   | Linux   | macOS   | Browser | Linux   |
| support    | Windows | Windows | Windows | Windows | iOS     | (cross- | Windows |
|            |         | macOS*  | macOS** | (some)  | tvOS    | platf.) |         |
|            |         | Android | Android |         |         |         |         |
|            |         | iOS     | iOS     |         |         |         |         |
+------------+---------+---------+---------+---------+---------+---------+---------+
| Maturity   | 17+     | 16+     | 10+     | 8+      | 11+     | 3+      | 8+      |
| (years)    | years   | years   | years   | years   | years   | years   | years   |
+------------+---------+---------+---------+---------+---------+---------+---------+
| Ecosystem  | HUGE    | Large   | Large   | Growing | Medium  | Growing | Growing |
| (libs,     | cuBLAS  | clBLAS  | (mostly | oneMKL  | MPS,    | (wgpu,  | hipBLAS |
| tools)     | cuDNN   | clFFT   | graphics| oneDNN  | BNNS,   | Dawn)   | MIOpen  |
|            | cuFFT   |         | focus)  |         | CoreML  |         | hipFFT  |
|            | Thrust  |         |         |         |         |         | rocThrust|
+============+=========+=========+=========+=========+=========+=========+=========+

* Lines count is for a minimal vector addition program
** macOS Vulkan via MoltenVK (Vulkan-to-Metal translation layer)
```

### Performance Comparison (Relative)

```
RELATIVE PERFORMANCE (vector addition, 10M elements, normalized to CUDA = 100)

                CUDA   HIP    OpenCL  Vulkan  SYCL   Metal   WebGPU
NVIDIA GPU:     100    98     92-95   90-95   90-95   N/A     75-85
AMD GPU:        N/A    100    90-95   90-95   88-93   N/A     75-85
Intel GPU:      N/A    N/A    88-92   88-93   100     N/A     75-85
Apple GPU:      N/A    N/A    N/A*    N/A**   N/A     100     80-90

Notes:
  - These are ROUGH estimates for simple kernels
  - Complex kernels with vendor-specific tuning can show larger gaps
  - WebGPU overhead is largely from JavaScript and validation
  - Metal on Apple Silicon benefits from UMA (no copy overhead)
  * Apple deprecated OpenCL (still works but frozen at 1.2)
  ** MoltenVK translates Vulkan to Metal (adds overhead)
```

---

## 8. Portability Strategies

### Strategy 1: Abstraction Layer (Wrapper Library)

Write your own thin abstraction that maps to each backend:

```cpp
// gpu_abstraction.hpp - Simplified portable GPU interface

#pragma once
#include <cstddef>

enum class GPUBackend {
    CUDA,
    HIP,
    OpenCL,
    Metal,
    SYCL
};

// Detect backend at compile time
#if defined(__CUDACC__)
    constexpr GPUBackend ACTIVE_BACKEND = GPUBackend::CUDA;
#elif defined(__HIP_PLATFORM_AMD__)
    constexpr GPUBackend ACTIVE_BACKEND = GPUBackend::HIP;
#elif defined(SYCL_LANGUAGE_VERSION)
    constexpr GPUBackend ACTIVE_BACKEND = GPUBackend::SYCL;
#else
    constexpr GPUBackend ACTIVE_BACKEND = GPUBackend::OpenCL;
#endif

// Unified buffer abstraction
template<typename T>
class GPUBuffer {
public:
    GPUBuffer(size_t count);
    ~GPUBuffer();

    void copyToDevice(const T* hostData, size_t count);
    void copyToHost(T* hostData, size_t count) const;

    T* devicePtr();
    const T* devicePtr() const;

private:
    T* ptr_;
    size_t size_;
};

// Implementation for CUDA/HIP (nearly identical)
#if defined(__CUDACC__) || defined(__HIP_PLATFORM_AMD__)

#if defined(__CUDACC__)
    #include <cuda_runtime.h>
    #define gpuMalloc       cudaMalloc
    #define gpuFree         cudaFree
    #define gpuMemcpy       cudaMemcpy
    #define gpuMemcpyH2D    cudaMemcpyHostToDevice
    #define gpuMemcpyD2H    cudaMemcpyDeviceToHost
    #define gpuSync         cudaDeviceSynchronize
#else
    #include <hip/hip_runtime.h>
    #define gpuMalloc       hipMalloc
    #define gpuFree         hipFree
    #define gpuMemcpy       hipMemcpy
    #define gpuMemcpyH2D    hipMemcpyHostToDevice
    #define gpuMemcpyD2H    hipMemcpyDeviceToHost
    #define gpuSync         hipDeviceSynchronize
#endif

template<typename T>
GPUBuffer<T>::GPUBuffer(size_t count) : size_(count * sizeof(T)) {
    gpuMalloc((void**)&ptr_, size_);
}

template<typename T>
GPUBuffer<T>::~GPUBuffer() {
    gpuFree(ptr_);
}

template<typename T>
void GPUBuffer<T>::copyToDevice(const T* hostData, size_t count) {
    gpuMemcpy(ptr_, hostData, count * sizeof(T), gpuMemcpyH2D);
}

template<typename T>
void GPUBuffer<T>::copyToHost(T* hostData, size_t count) const {
    gpuMemcpy(hostData, ptr_, count * sizeof(T), gpuMemcpyD2H);
}

template<typename T>
T* GPUBuffer<T>::devicePtr() { return ptr_; }

template<typename T>
const T* GPUBuffer<T>::devicePtr() const { return ptr_; }

#endif  // CUDA/HIP
```

### Strategy 2: Conditional Compilation

```cpp
// portable_kernel.hpp
// Use preprocessor to select backend at compile time

#pragma once

// ============================================
// KERNEL DEFINITION MACROS
// ============================================

#if defined(USE_CUDA)
    #define GPU_KERNEL      __global__
    #define GPU_DEVICE      __device__
    #define GPU_SHARED      __shared__
    #define GPU_SYNC        __syncthreads()
    #define THREAD_IDX_X    threadIdx.x
    #define BLOCK_IDX_X     blockIdx.x
    #define BLOCK_DIM_X     blockDim.x

#elif defined(USE_HIP)
    #define GPU_KERNEL      __global__
    #define GPU_DEVICE      __device__
    #define GPU_SHARED      __shared__
    #define GPU_SYNC        __syncthreads()
    #define THREAD_IDX_X    threadIdx.x
    #define BLOCK_IDX_X     blockIdx.x
    #define BLOCK_DIM_X     blockDim.x

#elif defined(USE_SYCL)
    // SYCL uses a completely different programming model
    // Can't easily unify with macros - use template abstraction
    #error "SYCL requires template-based abstraction, not macros"

#endif

// ============================================
// PORTABLE KERNEL (CUDA/HIP only)
// ============================================
GPU_KERNEL void vector_add(const float* A, const float* B,
                           float* C, int N) {
    int i = BLOCK_IDX_X * BLOCK_DIM_X + THREAD_IDX_X;
    if (i < N) {
        C[i] = A[i] + B[i];
    }
}
```

### Strategy 3: Using an Existing Portability Library

Several production-quality portability libraries exist:

```
PORTABILITY LIBRARIES

+------------------------------------------------------------------+
| Library     | Approach           | Backends                       |
+-------------+--------------------+--------------------------------+
| Kokkos      | C++ abstraction    | CUDA, HIP, SYCL, OpenMP,     |
|             | (DOE/Sandia)       | HPX, Serial                   |
+-------------+--------------------+--------------------------------+
| RAJA        | C++ abstraction    | CUDA, HIP, OpenMP, SYCL      |
|             | (DOE/LLNL)         |                                |
+-------------+--------------------+--------------------------------+
| Alpaka      | C++ abstraction    | CUDA, HIP, OpenMP, TBB,      |
|             | (CERN/DESY)        | Serial                        |
+-------------+--------------------+--------------------------------+
| SYCL        | Standard           | CUDA (via backends), HIP,     |
|             |                    | OpenCL, Level Zero            |
+-------------+--------------------+--------------------------------+
| Thrust/     | STL-like parallel  | CUDA, HIP (rocThrust),       |
| rocThrust   | algorithms         | TBB, OpenMP                   |
+-------------+--------------------+--------------------------------+
| stdpar      | C++ std::execution | NVIDIA (nvc++), Intel (icpx)  |
| (C++17)     | par/par_unseq      |                                |
+------------------------------------------------------------------+
```

### Choosing the Right API: Decision Framework

```
DECISION TREE FOR API SELECTION

START: What is your target platform?

[Only NVIDIA GPUs?]
  YES -> Use CUDA (best tooling, performance, ecosystem)
  NO  -> Continue

[Only AMD GPUs?]
  YES -> Use HIP (CUDA-like API, easy to learn)
  NO  -> Continue

[Only Apple devices?]
  YES -> Use Metal (only option, excellent on Apple Silicon)
  NO  -> Continue

[Browser-based?]
  YES -> Use WebGPU (only option for browser GPU compute)
  NO  -> Continue

[NVIDIA + AMD (data center)?]
  YES -> Consider:
         - HIP (if porting from CUDA, near-zero effort)
         - SYCL (if also targeting Intel, or want modern C++)
         - OpenCL (if mature, stable API preferred)
  NO  -> Continue

[All desktop GPUs (NVIDIA + AMD + Intel)?]
  YES -> Consider:
         - SYCL (modern C++, good multi-backend support)
         - Vulkan Compute (maximum control, widest driver support)
         - OpenCL (simpler than Vulkan, good enough for most)
  NO  -> Continue

[Desktop + Mobile + Browser?]
  YES -> Consider:
         - WebGPU (via wgpu-native for desktop, browser for web)
         - Vulkan + MoltenVK for Apple, WebGPU for browser
  NO  -> Continue

[HPC (supercomputers)?]
  YES -> Consider:
         - Kokkos or RAJA (DOE standard, battle-tested)
         - SYCL (growing HPC adoption)
         - HIP + CUDA (if only NVIDIA/AMD machines)
```

---

## 9. Performance Portability

The fundamental question: **Does portable code mean slower code?** The answer is nuanced.

### The Portability-Performance Gap

```
PERFORMANCE PORTABILITY SPECTRUM

  Vendor-Specific             Fully Portable
  (Maximum Performance)       (Maximum Reach)
  <------------------------->

  Hand-tuned CUDA PTX         C++ std::execution
  |                           |
  CUDA C++ with intrinsics    Kokkos / RAJA
  |                           |
  CUDA C++                    SYCL
  |                           |
  HIP (on AMD)                OpenCL
  |                           |
  Metal (on Apple)            Vulkan Compute
  |
  |
  TYPICAL PERFORMANCE GAP: 5-30%
  (for well-written portable code)

  WHERE THE GAP COMES FROM:
  +--------------------------------------------------+
  | 1. Warp/wavefront size differences (32 vs 64)    |
  | 2. Memory hierarchy differences                   |
  | 3. Instruction set differences (tensor cores,     |
  |    matrix cores, AMX)                              |
  | 4. Occupancy and register pressure differences    |
  | 5. Abstraction overhead (vtable, runtime dispatch)|
  | 6. Missing vendor-specific optimizations          |
  +--------------------------------------------------+
```

### Techniques for Maintaining Performance Across Platforms

**Technique 1: Compile-time specialization**

```cpp
// Use compile-time constants for platform-specific tuning

template<int WarpSize = 32, int TileSize = 16>
struct PlatformConfig {
    static constexpr int WARP_SIZE = WarpSize;
    static constexpr int TILE_SIZE = TileSize;
    static constexpr int WARPS_PER_BLOCK = 8;
    static constexpr int BLOCK_SIZE = WARPS_PER_BLOCK * WARP_SIZE;
};

// Platform-specific configurations
#if defined(__CUDA_ARCH__)
    using Config = PlatformConfig<32, 16>;  // NVIDIA: warp = 32
#elif defined(__AMDGCN__)
    using Config = PlatformConfig<64, 16>;  // AMD CDNA: wavefront = 64
#elif defined(__SPIR__)
    using Config = PlatformConfig<32, 16>;  // Intel: subgroup often 32
#else
    using Config = PlatformConfig<32, 16>;  // Default
#endif

// Kernel uses compile-time config
__global__ void reduce(const float* input, float* output, int N) {
    constexpr int BLOCK = Config::BLOCK_SIZE;
    constexpr int WARP = Config::WARP_SIZE;

    __shared__ float shared[BLOCK];
    int tid = threadIdx.x;
    int gid = blockIdx.x * BLOCK + tid;

    shared[tid] = (gid < N) ? input[gid] : 0.0f;
    __syncthreads();

    // Block-level reduction
    for (int s = BLOCK / 2; s >= WARP; s >>= 1) {
        if (tid < s) {
            shared[tid] += shared[tid + s];
        }
        __syncthreads();
    }

    // Warp-level reduction (no sync needed within a warp/wavefront)
    if (tid < WARP) {
        float val = shared[tid];
        for (int offset = WARP / 2; offset > 0; offset >>= 1) {
            val += __shfl_down_sync(0xFFFFFFFF, val, offset);
        }
        if (tid == 0) output[blockIdx.x] = val;
    }
}
```

**Technique 2: Autotuning work-group sizes**

```cpp
// Runtime selection of optimal work-group size

struct KernelConfig {
    int blockSize;
    int sharedMemBytes;
    int elementsPerThread;
};

KernelConfig autotune(int N, int deviceType) {
    // Query device properties and select optimal config
    KernelConfig config;

    switch (deviceType) {
        case GPU_NVIDIA:
            config.blockSize = 256;
            config.elementsPerThread = 4;
            config.sharedMemBytes = 256 * sizeof(float);
            break;
        case GPU_AMD:
            // AMD likes larger work-groups due to 64-wide wavefronts
            config.blockSize = 512;
            config.elementsPerThread = 4;
            config.sharedMemBytes = 512 * sizeof(float);
            break;
        case GPU_INTEL:
            // Intel Arc prefers smaller work-groups
            config.blockSize = 128;
            config.elementsPerThread = 8;
            config.sharedMemBytes = 128 * sizeof(float);
            break;
        default:
            config.blockSize = 256;
            config.elementsPerThread = 4;
            config.sharedMemBytes = 256 * sizeof(float);
    }

    return config;
}
```

**Technique 3: Platform-specific kernel variants with runtime dispatch**

```cpp
// Keep a "generic" kernel and platform-optimized variants

// Generic version (works everywhere, reasonable performance)
template<typename T>
void matmul_generic(const T* A, const T* B, T* C,
                    int M, int N, int K, GPUQueue& queue) {
    // Standard tiled matrix multiply
    // No vendor-specific intrinsics
    // ...
}

// NVIDIA-optimized version (uses tensor cores)
#ifdef __CUDA_ARCH__
template<>
void matmul_optimized<half>(const half* A, const half* B, half* C,
                             int M, int N, int K, GPUQueue& queue) {
    // Use wmma (Warp Matrix Multiply-Accumulate) for tensor cores
    // ...
}
#endif

// AMD-optimized version (uses matrix cores)
#ifdef __AMDGCN__
template<>
void matmul_optimized<half>(const half* A, const half* B, half* C,
                             int M, int N, int K, GPUQueue& queue) {
    // Use AMD matrix_fma intrinsics
    // ...
}
#endif

// Dispatch at runtime
template<typename T>
void matmul(const T* A, const T* B, T* C,
            int M, int N, int K, GPUQueue& queue) {
    if (queue.supportsOptimizedKernel()) {
        matmul_optimized<T>(A, B, C, M, N, K, queue);
    } else {
        matmul_generic<T>(A, B, C, M, N, K, queue);
    }
}
```

### Performance Portability in Practice

```
REAL-WORLD CASE STUDIES

1. LAMMPS (Molecular Dynamics) - Uses Kokkos
   - Runs on NVIDIA, AMD, Intel GPUs
   - Performance within 10-15% of hand-tuned CUDA on NVIDIA
   - Significant engineering savings from single codebase

2. PyTorch - Multiple backends
   - CUDA (NVIDIA), ROCm/HIP (AMD), Metal (Apple), XPU (Intel)
   - Each backend has hand-optimized kernels
   - Not truly "portable code" but portable framework

3. GROMACS (Molecular Dynamics) - Custom abstraction
   - CUDA, OpenCL, SYCL backends
   - ~5-15% overhead from abstraction on NVIDIA
   - Same code runs on 3 GPU vendors

4. Lattice QCD codes - Kokkos + RAJA
   - Exascale codes for DOE supercomputers
   - Must run on Frontier (AMD), Aurora (Intel), Summit (NVIDIA)
   - Performance portability is a hard requirement

KEY LESSON:
  For most applications, 5-15% performance cost of portability
  is well worth the reduced engineering effort. Only hyper-
  optimized libraries (cuBLAS, cuDNN) justify vendor lock-in.
```

---

## 10. Emerging Standards

### C++ Standard Parallelism (std::execution)

C++17 introduced parallel execution policies. C++26 is adding `std::execution` (senders/receivers) for heterogeneous execution. Some compilers already offload to GPUs:

```cpp
// C++ Standard Parallel Algorithms
// Compile (NVIDIA): nvc++ -stdpar=gpu -o par_example par_example.cpp
// Compile (Intel):  icpx -fsycl -o par_example par_example.cpp

#include <algorithm>
#include <execution>
#include <vector>
#include <numeric>
#include <iostream>

int main() {
    const int N = 10'000'000;
    std::vector<float> A(N), B(N), C(N);

    // Initialize
    std::iota(A.begin(), A.end(), 0.0f);
    std::iota(B.begin(), B.end(), 0.0f);

    // ========================================
    // Vector addition using std::transform
    // with parallel unsequenced execution policy
    // THIS CAN RUN ON A GPU (with nvc++ -stdpar=gpu)
    // ========================================
    std::transform(
        std::execution::par_unseq,  // Parallel + vectorizable
        A.begin(), A.end(),
        B.begin(),
        C.begin(),
        [](float a, float b) { return a + b; }
    );

    // ========================================
    // Reduction on GPU
    // ========================================
    float sum = std::reduce(
        std::execution::par_unseq,
        C.begin(), C.end(),
        0.0f
    );

    // ========================================
    // Sort on GPU
    // ========================================
    std::sort(
        std::execution::par_unseq,
        C.begin(), C.end()
    );

    // ========================================
    // Transform-reduce (dot product) on GPU
    // ========================================
    float dot = std::transform_reduce(
        std::execution::par_unseq,
        A.begin(), A.end(),
        B.begin(),
        0.0f
    );

    std::cout << "Sum: " << sum << std::endl;
    std::cout << "Dot product: " << dot << std::endl;

    return 0;
}
```

The beauty of `std::execution::par_unseq`: zero GPU-specific code. The compiler decides whether to run on CPU or GPU. The downside: you give up control over block sizes, shared memory, memory placement, and other GPU-specific optimizations.

### Kokkos

Kokkos (Sandia National Labs) is the most mature C++ performance portability framework. It is the backbone of many DOE exascale applications:

```cpp
// kokkos_vector_add.cpp
// Compile: g++ -o kokkos_example kokkos_vector_add.cpp
//          -I$KOKKOS_PATH/include -L$KOKKOS_PATH/lib -lkokkos
// Backend selected at compile time: -DKokkos_ENABLE_CUDA=ON
//                                   -DKokkos_ENABLE_HIP=ON
//                                   -DKokkos_ENABLE_SYCL=ON

#include <Kokkos_Core.hpp>
#include <cstdio>

int main(int argc, char* argv[]) {
    Kokkos::initialize(argc, argv);

    {
        const int N = 1024 * 1024;

        // Kokkos::View = multidimensional array with memory space awareness
        // Default memory space depends on backend (CudaSpace, HIPSpace, etc.)
        Kokkos::View<float*> A("A", N);
        Kokkos::View<float*> B("B", N);
        Kokkos::View<float*> C("C", N);

        // Host mirrors for initialization
        auto h_A = Kokkos::create_mirror_view(A);
        auto h_B = Kokkos::create_mirror_view(B);

        for (int i = 0; i < N; i++) {
            h_A(i) = static_cast<float>(i);
            h_B(i) = static_cast<float>(i * 2);
        }

        // Copy to device
        Kokkos::deep_copy(A, h_A);
        Kokkos::deep_copy(B, h_B);

        // ========================================
        // PARALLEL FOR (runs on whatever backend is compiled)
        // ========================================
        Kokkos::parallel_for("VectorAdd", N,
            KOKKOS_LAMBDA(const int i) {
                C(i) = A(i) + B(i);
            }
        );

        Kokkos::fence();  // Wait for completion

        // ========================================
        // PARALLEL REDUCE
        // ========================================
        float sum = 0.0f;
        Kokkos::parallel_reduce("Sum", N,
            KOKKOS_LAMBDA(const int i, float& lsum) {
                lsum += C(i);
            },
            sum
        );

        printf("Sum = %f\n", sum);

        // Verify
        auto h_C = Kokkos::create_mirror_view(C);
        Kokkos::deep_copy(h_C, C);

        bool correct = true;
        for (int i = 0; i < N; i++) {
            if (h_C(i) != h_A(i) + h_B(i)) {
                correct = false;
                break;
            }
        }
        printf("Result: %s\n", correct ? "PASS" : "FAIL");
    }

    Kokkos::finalize();
    return 0;
}
```

### RAJA

RAJA (Lawrence Livermore National Lab) takes a policy-based approach:

```cpp
// raja_vector_add.cpp
// Compile with appropriate backend flags

#include "RAJA/RAJA.hpp"
#include <cstdio>

// ========================================
// EXECUTION POLICIES (swap at compile time)
// ========================================

// Sequential CPU
using seq_policy = RAJA::seq_exec;

// OpenMP parallel
using omp_policy = RAJA::omp_parallel_for_exec;

// CUDA GPU
using cuda_policy = RAJA::cuda_exec<256>;  // 256 threads/block

// HIP GPU
using hip_policy = RAJA::hip_exec<256>;

// Choose policy based on build config
#if defined(RAJA_ENABLE_CUDA)
    using exec_policy = cuda_policy;
#elif defined(RAJA_ENABLE_HIP)
    using exec_policy = hip_policy;
#elif defined(RAJA_ENABLE_OPENMP)
    using exec_policy = omp_policy;
#else
    using exec_policy = seq_policy;
#endif

int main() {
    const int N = 1024 * 1024;

    // RAJA managed arrays (handle device allocation)
    float* A = RAJA::allocate<float>(RAJA::Platform::device, N);
    float* B = RAJA::allocate<float>(RAJA::Platform::device, N);
    float* C = RAJA::allocate<float>(RAJA::Platform::device, N);

    // Initialize (using forall with policy)
    RAJA::forall<exec_policy>(
        RAJA::RangeSegment(0, N),
        [=] RAJA_HOST_DEVICE(int i) {
            A[i] = static_cast<float>(i);
            B[i] = static_cast<float>(i * 2);
        }
    );

    // Vector addition
    RAJA::forall<exec_policy>(
        RAJA::RangeSegment(0, N),
        [=] RAJA_HOST_DEVICE(int i) {
            C[i] = A[i] + B[i];
        }
    );

    // Reduction
    RAJA::ReduceSum<RAJA::cuda_reduce, float> sum(0.0f);
    RAJA::forall<exec_policy>(
        RAJA::RangeSegment(0, N),
        [=] RAJA_HOST_DEVICE(int i) {
            sum += C[i];
        }
    );

    printf("Sum = %f\n", sum.get());

    RAJA::deallocate(A);
    RAJA::deallocate(B);
    RAJA::deallocate(C);

    return 0;
}
```

### Comparison of Portability Frameworks

```
+===============+============+============+============+===========+
| Feature       | std::par   | Kokkos     | RAJA       | SYCL      |
+===============+============+============+============+===========+
| Approach      | Standard   | Views +    | Policies + | Standard  |
|               | algorithms | parallel   | forall     | C++ with  |
|               |            | patterns   |            | queues    |
+---------------+------------+------------+------------+-----------+
| Learning      | Very Low   | Medium     | Medium     | Medium    |
| curve         | (know STL) |            |            |           |
+---------------+------------+------------+------------+-----------+
| Control       | None       | High       | High       | High      |
| (memory,      | (compiler  | (Views,    | (policies) | (USM,     |
| execution)    | decides)   | spaces)    |            | accessors)|
+---------------+------------+------------+------------+-----------+
| GPU backends  | NVIDIA*,   | CUDA, HIP, | CUDA, HIP, | CUDA**,  |
|               | Intel*     | SYCL, OMP  | SYCL, OMP  | HIP**,   |
|               |            | Serial     | Serial     | OpenCL,  |
|               |            |            |            | L0       |
+---------------+------------+------------+------------+-----------+
| Memory        | Implicit   | Explicit   | Explicit   | Both     |
| management    |            | (Views)    | (managed)  |          |
+---------------+------------+------------+------------+-----------+
| Maturity      | Young      | Very       | Very       | Maturing |
|               |            | Mature     | Mature     |          |
+---------------+------------+------------+------------+-----------+
| Main users    | General    | DOE labs,  | DOE labs   | Intel,   |
|               | C++ devs   | HPC        |            | HPC, AI  |
+---------------+------------+------------+------------+-----------+

* Requires specific compiler (nvc++, icpx)
** Via AdaptiveCpp or Intel DPC++ with plugins
```

---

## When to Use What: The Decision Guide

This is the section to bookmark. When starting a new GPU compute project, walk through these questions:

### By Target Hardware

```
+-----------------------+----------------------------------+
| Target                | Recommended API                  |
+-----------------------+----------------------------------+
| NVIDIA only           | CUDA                             |
| AMD only              | HIP                              |
| Apple only            | Metal                            |
| NVIDIA + AMD          | HIP (easiest) or SYCL            |
| All desktop GPUs      | SYCL, Vulkan, or OpenCL          |
| Browser               | WebGPU                           |
| HPC supercomputers    | Kokkos, RAJA, or SYCL            |
| Mobile                | Vulkan (Android), Metal (iOS)    |
| FPGA                  | OpenCL or SYCL (Intel oneAPI)    |
| Everything            | WebGPU (via wgpu-native) or SYCL |
+-----------------------+----------------------------------+
```

### By Use Case

```
+-------------------------------+----------------------------------+
| Use Case                      | Recommended API                  |
+-------------------------------+----------------------------------+
| Machine learning training     | CUDA (ecosystem), HIP (AMD)     |
| ML inference (edge/mobile)    | Metal (Apple), Vulkan (Android)  |
| Scientific simulation (HPC)   | Kokkos, RAJA, CUDA, HIP         |
| Game engine compute           | Vulkan, Metal, DirectX           |
| Web application compute       | WebGPU                           |
| Image/video processing        | CUDA, Metal, OpenCL, Vulkan     |
| Crypto / blockchain           | CUDA, OpenCL (multi-vendor)     |
| Cross-platform library        | SYCL or Vulkan compute           |
| Prototyping / learning        | CUDA (best docs) or SYCL        |
| Production multi-vendor       | Vulkan (control) or SYCL (ease) |
+-------------------------------+----------------------------------+
```

### By Team Expertise

```
+------------------------------+----------------------------------+
| Team Background              | Recommended API                  |
+------------------------------+----------------------------------+
| C++ developers               | SYCL (standard C++)             |
| CUDA developers              | HIP (trivial migration)          |
| Graphics developers          | Vulkan compute                   |
| Web developers               | WebGPU / WGSL                   |
| iOS/macOS developers         | Metal                            |
| HPC / Fortran background     | Kokkos or RAJA                   |
| No GPU experience            | SYCL or std::execution           |
+------------------------------+----------------------------------+
```

### The Pragmatic Recommendation

For most teams in 2025 and beyond:

```
PRAGMATIC DECISION FLOW

1. Start with CUDA (if NVIDIA) or HIP (if AMD)
   - Best documentation, most examples, fastest iteration
   - Learn GPU programming concepts first

2. If you need portability, use SYCL
   - Modern C++, reasonable performance across vendors
   - Growing ecosystem and compiler support
   - Can target CUDA/HIP/OpenCL backends

3. If you need maximum control across vendors, use Vulkan
   - Steepest learning curve but widest hardware support
   - Best choice if you also need graphics

4. If you target Apple, use Metal
   - No other choice, but excellent on Apple Silicon

5. If you target browsers, use WebGPU
   - Only choice, but surprisingly capable

6. For HPC at national labs, use Kokkos or RAJA
   - Battle-tested on exascale machines
   - Strong community support

7. For future-proofing with minimal effort, use std::execution
   - Standard C++, zero vendor dependency
   - Limited control, but zero learning curve for C++ devs
```

### Final Thought

No single API wins everywhere. The GPU computing landscape will continue to fragment as new hardware (NPUs, TPUs, custom AI chips) proliferates. The most valuable skill is not mastering one API, but understanding the underlying parallel computing concepts. Thread hierarchies, memory hierarchies, synchronization, occupancy, coalescing: these concepts transfer across every API covered in this chapter. Learn the concepts once, and adapting to any new API becomes a matter of learning syntax, not rethinking your approach.

```
THE HIERARCHY OF GPU PROGRAMMING KNOWLEDGE

  Level 4: Vendor-specific tuning       (Tensor cores, matrix cores)
           API-specific                  Least transferable
                |
  Level 3: API syntax and idioms         (CUDA, SYCL, Metal, etc.)
           Moderately transferable
                |
  Level 2: Parallel algorithm design     (Reduction, scan, sort)
           Highly transferable
                |
  Level 1: Hardware understanding        (Memory hierarchy, SIMT,
           Fully transferable             occupancy, coalescing)
                |
  FOUNDATION: Computational thinking    (Decomposition, data
              Always transferable        parallelism, communication)
```

Invest most of your learning time at Levels 1 and 2. The rest follows naturally.
