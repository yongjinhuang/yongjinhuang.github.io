# Chapter 5: RTOS Fundamentals -- Concurrency on Microcontrollers

A bare-metal embedded program typically runs a single infinite loop -- the "superloop" -- polling peripherals and executing tasks sequentially. This works for simple systems, but as complexity grows, the superloop becomes unwieldy. Tasks with different timing requirements compete for CPU time, latency becomes unpredictable, and adding new features risks breaking existing ones. A Real-Time Operating System (RTOS) solves these problems by providing deterministic multitasking on resource-constrained hardware. This chapter covers RTOS fundamentals with a focus on FreeRTOS, the most widely deployed RTOS in the world.

---

## 1. Why Use an RTOS?

### 1.1 The Bare-Metal Superloop

```c
// Classic superloop architecture
int main(void) {
    hardware_init();

    while (1) {
        read_sensors();        // 2 ms
        process_data();        // 5 ms
        update_display();      // 10 ms
        check_buttons();       // 1 ms
        send_to_cloud();       // 50-500 ms (variable!)
    }
}
```

Problems with this approach:

1. **Latency coupling**: `check_buttons()` runs only after `update_display()` finishes. If `send_to_cloud()` blocks for 500 ms, the button response time degrades to 500+ ms.
2. **No prioritization**: A critical alarm check has no way to preempt a low-priority display update.
3. **Timing jitter**: The loop period varies with execution path, making precise periodic tasks difficult.
4. **Scalability**: Adding a new task changes the timing of all existing tasks.

### 1.2 What an RTOS Provides

An RTOS provides:

- **Preemptive multitasking**: Higher-priority tasks interrupt lower-priority ones
- **Deterministic timing**: Predictable worst-case response times
- **Synchronization primitives**: Semaphores, mutexes, queues for safe data sharing
- **Timing services**: Software timers, precise delays
- **Memory management**: Pool allocators, stack monitoring

The overhead is modest: FreeRTOS requires roughly 5-10 KB of flash and 1-2 KB of RAM for the kernel, plus stack space for each task.

### 1.3 When NOT to Use an RTOS

An RTOS adds complexity. Avoid it when:

- The application is simple enough for a superloop with timer interrupts
- RAM is extremely limited (< 4 KB total)
- Every cycle counts and context switch overhead is unacceptable
- Hard real-time requirements are better served by bare-metal with carefully crafted ISRs

---

## 2. FreeRTOS Deep Dive

### 2.1 Overview

FreeRTOS is open source (MIT license), supports 40+ architectures, and is maintained by AWS. It is the RTOS used in ESP-IDF, many STM32 projects, and AWS IoT device SDKs. The kernel is remarkably small -- about 9,000 lines of C.

### 2.2 Tasks

A task in FreeRTOS is an independent thread of execution with its own stack and priority. Tasks are created with `xTaskCreate()`:

```c
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

void sensor_task(void *pvParameters) {
    TickType_t last_wake = xTaskGetTickCount();

    for (;;) {
        float temp = read_temperature();
        publish_temperature(temp);

        // Block until exactly 1000 ms have passed
        vTaskDelayUntil(&last_wake, pdMS_TO_TICKS(1000));
    }
}

void app_main(void) {
    xTaskCreate(
        sensor_task,       // Task function
        "SensorTask",      // Name (for debugging)
        4096,              // Stack size (bytes)
        NULL,              // Parameter
        5,                 // Priority (higher = more important)
        NULL               // Task handle (optional)
    );
}
```

### 2.3 The Scheduler

FreeRTOS uses a **priority-based preemptive scheduler**. The highest-priority ready task always runs. If two tasks share the same priority, they are time-sliced (round-robin) if `configUSE_TIME_SLICING` is enabled.

### 2.4 The Tick Interrupt

The scheduler is driven by a periodic hardware timer interrupt called the "tick." The tick frequency is set by `configTICK_RATE_HZ` (typically 100-1000 Hz). Each tick:

1. Increments the tick counter
2. Checks if any blocked tasks should be unblocked (delays expired)
3. Triggers a context switch if a higher-priority task became ready

A 1 ms tick (1000 Hz) means the scheduler can respond within 1 ms. Lower tick rates save power but reduce timing granularity.

### 2.5 configMAX_PRIORITIES

FreeRTOS supports a configurable number of priority levels (typically 5-25). Priority 0 is the lowest (idle task), and `configMAX_PRIORITIES - 1` is the highest.

```
  Priority Levels (configMAX_PRIORITIES = 5)
  ==========================================

  Priority 4: [Critical Alarm Task]     <-- Runs first if ready
  Priority 3: [Motor Control Task]
  Priority 2: [Sensor Reading Task]
  Priority 1: [Display Update Task]
  Priority 0: [Idle Task]               <-- Runs when nothing else can
```

---

## 3. Zephyr RTOS Overview

Zephyr is an open-source RTOS backed by the Linux Foundation. It is gaining traction, especially in the Nordic nRF ecosystem. Key differences from FreeRTOS:

| Feature             | FreeRTOS             | Zephyr                       |
| ------------------- | -------------------- | ---------------------------- |
| License             | MIT                  | Apache 2.0                   |
| Build system        | CMake / Makefile     | CMake + Kconfig + Devicetree |
| Networking          | Add-on (lwIP, etc.)  | Native TCP/IP, BLE, Thread   |
| File system         | Add-on               | Native (LittleFS, FAT)       |
| Shell               | No                   | Built-in CLI shell           |
| Device driver model | None (bare register) | Unified device driver API    |
| Footprint           | ~5-10 KB             | ~8-20 KB                     |

Zephyr provides a more "Linux-like" development experience with Kconfig, Devicetree, and a comprehensive driver model. FreeRTOS is simpler and more widely deployed.

---

## 4. Task States

### 4.1 State Machine

A FreeRTOS task is always in one of four states:

```
  Task State Machine
  ==================

                 vTaskSuspend()
  +----------+ <--------------------- +----------+
  | SUSPENDED |                        |          |
  +----------+ ---------------------> |          |
                 vTaskResume()         |          |
                                       |  READY   |
  +----------+   Event / Timeout       |          |
  | BLOCKED  | ---------------------> |          |
  +----------+ <---------+            +----+-----+
       ^                 |                 |
       |    Wait for     |    Scheduler    |
       |    event/delay  |    selects      |
       |                 |    (highest     |
       |            +----+-----+  priority)|
       +----------- | RUNNING  | <---------+
                     +----------+
                    (Only 1 task can
                     be RUNNING at a time)
```

**Ready**: The task can run but a higher-priority task is currently running.
**Running**: The task is executing on the CPU. Only one task can be in this state per core.
**Blocked**: The task is waiting for an event (semaphore, queue, delay). It consumes no CPU time.
**Suspended**: The task is explicitly suspended with `vTaskSuspend()`. It will not run until `vTaskResume()` is called.

### 4.2 Blocked vs Suspended

The distinction matters: a blocked task will automatically become ready when its wait condition is met (timeout expires, semaphore given). A suspended task will remain suspended indefinitely until explicitly resumed. Use blocking for normal synchronization; use suspend/resume sparingly for administrative control.

---

## 5. Priority-Based Preemptive Scheduling

### 5.1 How Preemption Works

When a higher-priority task becomes ready (e.g., an ISR gives a semaphore it was waiting for), the scheduler immediately preempts the currently running lower-priority task:

```
  Preemptive Scheduling Timeline
  ==============================

  Priority 3: [Task A]     |====|         |====|
  Priority 2: [Task B]          |==|   |==|
  Priority 1: [Task C]              |=|
                            ---|--|--|--|--|--|---> Time
                            t0 t1 t2 t3 t4 t5

  t0: Task A runs (highest priority ready)
  t1: Task A blocks (waiting for data), Task B runs
  t2: Task B blocks, Task C runs
  t3: Event wakes Task B, preempts Task C
  t4: Task A's data arrives, preempts Task B
  t5: Task A blocks again, Task B resumes
```

### 5.2 Time Slicing

When multiple tasks share the same priority, FreeRTOS distributes CPU time equally using round-robin scheduling at each tick:

```c
// Both tasks at priority 2
xTaskCreate(task_a, "A", 2048, NULL, 2, NULL);
xTaskCreate(task_b, "B", 2048, NULL, 2, NULL);

// If configUSE_TIME_SLICING == 1:
// Task A runs for 1 tick, then Task B for 1 tick, etc.
```

---

## 6. Synchronization Primitives

### 6.1 Binary Semaphore

A binary semaphore is a signaling mechanism with two states: taken (0) and given (1). It is commonly used for ISR-to-task signaling:

```c
SemaphoreHandle_t xButtonSem;

// ISR: runs when button is pressed
void IRAM_ATTR button_isr_handler(void *arg) {
    BaseType_t xHigherPriorityTaskWoken = pdFALSE;
    xSemaphoreGiveFromISR(xButtonSem, &xHigherPriorityTaskWoken);
    portYIELD_FROM_ISR(xHigherPriorityTaskWoken);
}

// Task: waits for button press
void button_task(void *pvParameters) {
    for (;;) {
        // Block until semaphore is given (no CPU used while waiting)
        if (xSemaphoreTake(xButtonSem, portMAX_DELAY) == pdTRUE) {
            handle_button_press();
        }
    }
}

void app_main(void) {
    xButtonSem = xSemaphoreCreateBinary();
    gpio_install_isr_service(0);
    gpio_isr_handler_add(BUTTON_PIN, button_isr_handler, NULL);
    xTaskCreate(button_task, "Button", 2048, NULL, 5, NULL);
}
```

### 6.2 Counting Semaphore

A counting semaphore allows a value greater than 1. Use cases:

- **Resource counting**: Allow up to N tasks to access a resource simultaneously
- **Event counting**: Count events without losing them (unlike binary semaphore which saturates at 1)

```c
// Allow up to 3 tasks to use SPI bus simultaneously
SemaphoreHandle_t xSpiSem = xSemaphoreCreateCounting(3, 3);

void spi_user_task(void *pvParameters) {
    for (;;) {
        if (xSemaphoreTake(xSpiSem, pdMS_TO_TICKS(100)) == pdTRUE) {
            perform_spi_transfer();
            xSemaphoreGive(xSpiSem);
        }
    }
}
```

### 6.3 Mutex with Priority Inheritance

A mutex (mutual exclusion) is like a binary semaphore but with an important addition: **priority inheritance**. If a low-priority task holds a mutex and a high-priority task tries to take it, the low-priority task is temporarily boosted to the high-priority level to prevent priority inversion.

```c
SemaphoreHandle_t xI2CMutex = xSemaphoreCreateMutex();

void sensor_task(void *pvParameters) {
    for (;;) {
        if (xSemaphoreTake(xI2CMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
            // Exclusive access to I2C bus
            int16_t temp = i2c_read_temperature();
            xSemaphoreGive(xI2CMutex);
            process_temperature(temp);
        }
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
```

**Key rule**: Always use mutexes (not binary semaphores) for mutual exclusion. Binary semaphores lack priority inheritance and can cause priority inversion.

---

## 7. Message Queues and Mailboxes

### 7.1 Queues

Queues are the primary inter-task communication mechanism in FreeRTOS. They provide thread-safe FIFO buffering with blocking send and receive:

```c
typedef struct {
    float temperature;
    float humidity;
    uint32_t timestamp;
} SensorReading;

QueueHandle_t xSensorQueue;

void producer_task(void *pvParameters) {
    for (;;) {
        SensorReading reading = {
            .temperature = read_temp(),
            .humidity = read_humidity(),
            .timestamp = xTaskGetTickCount(),
        };

        // Block for up to 100 ms if queue is full
        if (xQueueSend(xSensorQueue, &reading,
                       pdMS_TO_TICKS(100)) != pdTRUE) {
            // Queue full -- reading dropped
        }

        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

void consumer_task(void *pvParameters) {
    SensorReading reading;

    for (;;) {
        // Block indefinitely until data is available
        if (xQueueReceive(xSensorQueue, &reading,
                          portMAX_DELAY) == pdTRUE) {
            log_reading(&reading);
        }
    }
}

void app_main(void) {
    xSensorQueue = xQueueCreate(10, sizeof(SensorReading));
    xTaskCreate(producer_task, "Producer", 4096, NULL, 3, NULL);
    xTaskCreate(consumer_task, "Consumer", 4096, NULL, 4, NULL);
}
```

### 7.2 Mailboxes

A mailbox in some RTOS implementations is a queue of length 1 that allows overwriting. FreeRTOS implements this with `xQueueOverwrite()`. The consumer always reads the latest value:

```c
QueueHandle_t xMailbox = xQueueCreate(1, sizeof(SystemStatus));

// Writer: always overwrites with latest status
xQueueOverwrite(xMailbox, &current_status);

// Reader: peeks at latest status without removing
xQueuePeek(xMailbox, &status_copy, portMAX_DELAY);
```

---

## 8. Event Groups

Event groups allow tasks to wait for combinations of events using bitwise operations:

```c
#include "freertos/event_groups.h"

#define WIFI_CONNECTED_BIT    BIT0
#define MQTT_CONNECTED_BIT    BIT1
#define SENSOR_READY_BIT      BIT2

EventGroupHandle_t xSystemEvents;

void cloud_task(void *pvParameters) {
    // Wait until WiFi AND MQTT are connected AND sensor is ready
    EventBits_t bits = xEventGroupWaitBits(
        xSystemEvents,
        WIFI_CONNECTED_BIT | MQTT_CONNECTED_BIT | SENSOR_READY_BIT,
        pdFALSE,       // Don't clear bits on exit
        pdTRUE,        // Wait for ALL bits (AND logic)
        portMAX_DELAY
    );

    // All three conditions met -- start cloud reporting
    start_cloud_reporting();
}

// In WiFi event handler:
xEventGroupSetBits(xSystemEvents, WIFI_CONNECTED_BIT);

// In MQTT callback:
xEventGroupSetBits(xSystemEvents, MQTT_CONNECTED_BIT);

// In sensor init:
xEventGroupSetBits(xSystemEvents, SENSOR_READY_BIT);
```

---

## 9. Software Timers

Software timers execute a callback function at a specified interval without requiring a dedicated task:

```c
#include "freertos/timers.h"

void heartbeat_callback(TimerHandle_t xTimer) {
    toggle_led();
}

void watchdog_callback(TimerHandle_t xTimer) {
    if (!system_healthy()) {
        trigger_safe_shutdown();
    }
}

void app_main(void) {
    // Auto-reload timer: fires every 500 ms
    TimerHandle_t heartbeat = xTimerCreate(
        "Heartbeat", pdMS_TO_TICKS(500),
        pdTRUE,   // Auto-reload
        NULL, heartbeat_callback
    );
    xTimerStart(heartbeat, 0);

    // One-shot timer: fires once after 30 seconds
    TimerHandle_t watchdog = xTimerCreate(
        "Watchdog", pdMS_TO_TICKS(30000),
        pdFALSE,  // One-shot
        NULL, watchdog_callback
    );
    xTimerStart(watchdog, 0);
}
```

Software timers execute in the context of the timer daemon task. Timer callbacks must not block.

---

## 10. Memory Management in RTOS

### 10.1 Static vs Dynamic Allocation

FreeRTOS supports both:

**Dynamic** (default): Tasks, queues, semaphores are allocated from a heap using `pvPortMalloc()`. Simpler to use but introduces fragmentation risk.

**Static**: Memory is provided by the application at compile time using `xTaskCreateStatic()`, etc. No fragmentation, deterministic, but requires manual sizing.

```c
// Static task allocation
static StaticTask_t xTaskBuffer;
static StackType_t xStack[2048];

TaskHandle_t xHandle = xTaskCreateStatic(
    my_task,
    "Static",
    2048,           // Stack size in words
    NULL,
    3,
    xStack,         // Application-provided stack
    &xTaskBuffer    // Application-provided TCB
);
```

### 10.2 FreeRTOS Heap Implementations

FreeRTOS provides five heap implementations:

| Heap   | Description                            | Fragmentation | Free support |
| ------ | -------------------------------------- | ------------- | ------------ |
| heap_1 | Allocate only, never free              | None          | No           |
| heap_2 | Best-fit, free supported               | Yes           | Yes          |
| heap_3 | Wraps standard malloc/free             | Yes           | Yes          |
| heap_4 | First-fit with coalescing              | Reduced       | Yes          |
| heap_5 | Like heap_4 but spans multiple regions | Reduced       | Yes          |

For production systems, `heap_4` is the most common choice. For safety-critical systems, `heap_1` or static allocation eliminates fragmentation entirely.

### 10.3 Memory Pools

Memory pools (also called fixed-size block allocators) eliminate fragmentation by allocating fixed-size blocks:

```
  Memory Pool (16-byte blocks)
  ============================

  +------+------+------+------+------+------+
  |USED  | FREE | FREE |USED  |USED  | FREE |
  |16B   | 16B  | 16B  |16B   |16B   | 16B  |
  +------+------+------+------+------+------+

  - No fragmentation (all blocks same size)
  - O(1) alloc and free
  - Must pre-determine block size and count
```

FreeRTOS does not include a built-in pool allocator, but they are easy to implement or available in libraries.

### 10.4 Heap Fragmentation

Fragmentation occurs when free memory exists but not in contiguous blocks large enough for an allocation:

```
  Fragmented Heap
  ===============

  |USED|free|USED|free|USED|free|USED|free|
  | 32 | 16 | 64 | 16 | 32 | 16 | 64 | 16 |

  Total free: 64 bytes
  Largest contiguous: 16 bytes
  Request for 32 bytes: FAILS despite 64 bytes free!
```

Mitigation strategies:

- Use static allocation where possible
- Use memory pools for frequently allocated/freed objects
- Allocate all dynamic objects at startup, never free
- Use `heap_4` or `heap_5` which coalesce adjacent free blocks

---

## 11. Stack Overflow Detection

Each task has its own stack. If a task uses more stack than allocated, it corrupts adjacent memory, causing unpredictable crashes. FreeRTOS provides two detection methods:

**Method 1** (`configCHECK_FOR_STACK_OVERFLOW == 1`): At each context switch, check if the stack pointer has exceeded the stack boundary. Fast but can miss overflow that occurs and recovers between context switches.

**Method 2** (`configCHECK_FOR_STACK_OVERFLOW == 2`): Fills the stack with a known pattern (0xA5A5A5A5) at creation. At each context switch, checks if the last 20 bytes still contain the pattern. More reliable but slightly slower.

```c
// Called when stack overflow is detected
void vApplicationStackOverflowHook(TaskHandle_t xTask,
                                    char *pcTaskName) {
    // Log the offending task and halt
    printf("STACK OVERFLOW in task: %s\n", pcTaskName);
    abort();
}
```

Use `uxTaskGetStackHighWaterMark()` during development to measure worst-case stack usage and right-size your stacks.

---

## 12. Priority Inversion Problem

### 12.1 The Classic Scenario

Priority inversion occurs when a high-priority task is indirectly blocked by a low-priority task:

```
  Priority Inversion Scenario
  ===========================

  Priority:  High=H  Medium=M  Low=L

  Time --->
  ========================================================

  L: |===LOCK(mutex)===|                    |UNLOCK|
  M:                    |================|
  H:        |--WAIT(mutex)----BLOCKED----|          |====|

  1. Task L acquires mutex
  2. Task H preempts L, tries to acquire same mutex, BLOCKS
  3. Task M (doesn't need mutex) preempts L and runs
  4. Task H is blocked by Task M indirectly!
     H waits for L, but L can't run because M is running.

  This is PRIORITY INVERSION: H is effectively at lower
  priority than M.
```

### 12.2 Priority Inheritance Solution

When Task H tries to take a mutex held by Task L, the RTOS temporarily raises L's priority to match H:

```
  Priority Inheritance
  ====================

  L: |===LOCK===|===(boosted to H)===|UNLOCK|
  M:                                          |==========|
  H:        |--WAIT--|                        |==========|

  1. Task L acquires mutex
  2. Task H tries mutex, L is boosted to priority H
  3. Task M cannot preempt L (L is now at priority H)
  4. Task L finishes quickly, releases mutex
  5. L drops back to original priority
  6. H runs immediately, then M runs
```

FreeRTOS mutexes implement priority inheritance automatically. Binary semaphores do not -- this is why mutexes must be used for mutual exclusion.

### 12.3 Mars Pathfinder Case Study

In 1997, the Mars Pathfinder lander experienced repeated system resets caused by priority inversion. A low-priority meteorological task held a shared bus mutex. A high-priority bus management task needed the mutex but was blocked. A medium-priority communications task preempted the low-priority task, extending the block time beyond the watchdog timeout.

The fix was enabling priority inheritance on the mutex, which was already supported by the VxWorks RTOS but had been left disabled. The patch was uploaded to Mars remotely. This remains the most famous real-world priority inversion bug.

---

## 13. Rate Monotonic Scheduling

### 13.1 Theory

Rate Monotonic Scheduling (RMS) is a priority assignment policy for periodic tasks: **the task with the shortest period gets the highest priority.**

RMS is optimal among fixed-priority schedulers -- if any fixed-priority assignment can meet all deadlines, RMS can too.

### 13.2 Schedulability Test

A set of N periodic tasks is guaranteed schedulable under RMS if:

```
  U = sum(Ci / Ti) <= N * (2^(1/N) - 1)

  Where:
    Ci = worst-case execution time of task i
    Ti = period of task i
    U  = total CPU utilization

  Bound values:
    N=1:  U <= 1.000  (100%)
    N=2:  U <= 0.828  (82.8%)
    N=3:  U <= 0.780  (78.0%)
    N=inf: U <= ln(2) = 0.693 (69.3%)
```

Example:

```
  Task A: Period=10ms, WCET=2ms  -> U_A = 0.20
  Task B: Period=25ms, WCET=5ms  -> U_B = 0.20
  Task C: Period=50ms, WCET=10ms -> U_C = 0.20

  Total U = 0.60
  Bound for N=3: 0.780

  0.60 <= 0.780  ->  SCHEDULABLE under RMS

  Priority assignment: A > B > C (shortest period = highest priority)
```

### 13.3 Practical Considerations

RMS assumes independent tasks with no shared resources, no blocking, and zero context switch time. Real systems violate these assumptions, so RMS provides a starting point, not a guarantee. Use worst-case execution time analysis and runtime monitoring to validate.

---

## 14. Worst-Case Execution Time (WCET) Analysis

### 14.1 Why WCET Matters

In a real-time system, meeting deadlines is as important as correctness. WCET analysis determines the maximum time a task can take, allowing you to verify that all deadlines will be met.

### 14.2 Measurement-Based Approach

```c
// Toggle a GPIO pin before and after the critical section
// Measure with oscilloscope or logic analyzer

gpio_set_level(DEBUG_PIN, 1);
critical_function();
gpio_set_level(DEBUG_PIN, 0);

// Also: use the cycle counter
uint32_t start = portGET_RUN_TIME_COUNTER_VALUE();
critical_function();
uint32_t elapsed = portGET_RUN_TIME_COUNTER_VALUE() - start;
```

Measurement-based WCET is practical but cannot guarantee the true worst case was observed. Exercise all code paths, especially error handlers.

### 14.3 Static Analysis

Tools like AbsInt aiT and OTAWA analyze the binary and the processor model (cache, pipeline) to compute a proven upper bound on execution time. This is required for safety-critical systems (DO-178C, IEC 62304).

---

## 15. Common Pitfalls

### 15.1 Stack Overflow

The most common RTOS bug. Symptoms: random crashes, corrupted data, hard faults. Always enable stack overflow checking during development and use high-water mark monitoring.

### 15.2 Priority Inversion

Use mutexes (not binary semaphores) for shared resources. Design to minimize the critical section length.

### 15.3 Deadlock

Two tasks each hold a resource the other needs:

```c
// Task A                    // Task B
take(mutex_X);               take(mutex_Y);
take(mutex_Y);  // BLOCKS    take(mutex_X);  // BLOCKS
// DEADLOCK!                 // DEADLOCK!
```

Prevention: always acquire mutexes in the same order across all tasks.

### 15.4 Starvation

A low-priority task never runs because higher-priority tasks consume all CPU time. Ensure high-priority tasks block (sleep/wait) frequently.

### 15.5 Forgetting to Yield

In cooperative scheduling or same-priority time-slicing, a task that never blocks or delays will starve peers. Always include blocking calls or explicit delays in task loops.

### 15.6 ISR-Unsafe API Calls

Never call blocking API functions from an ISR. Use the `FromISR` variants:

```c
// WRONG: in ISR
xSemaphoreTake(sem, portMAX_DELAY);  // Will crash!

// CORRECT: in ISR
BaseType_t woken = pdFALSE;
xSemaphoreGiveFromISR(sem, &woken);
portYIELD_FROM_ISR(woken);
```

### 15.7 Unbounded Priority Inversion

Without priority inheritance, a chain of medium-priority tasks can extend the inversion indefinitely. Always use mutexes with priority inheritance for shared resources.

---

## 16. FreeRTOS Configuration Summary

Key `FreeRTOSConfig.h` settings:

```c
#define configUSE_PREEMPTION            1
#define configUSE_TIME_SLICING          1
#define configTICK_RATE_HZ              1000
#define configMAX_PRIORITIES            25
#define configMINIMAL_STACK_SIZE        128   // words
#define configTOTAL_HEAP_SIZE           (64 * 1024)
#define configUSE_MUTEXES               1
#define configUSE_COUNTING_SEMAPHORES   1
#define configUSE_QUEUE_SETS            1
#define configUSE_TIMERS                1
#define configTIMER_TASK_PRIORITY       2
#define configTIMER_QUEUE_LENGTH        10
#define configTIMER_TASK_STACK_DEPTH    2048
#define configCHECK_FOR_STACK_OVERFLOW  2
#define configUSE_TRACE_FACILITY        1
#define configSUPPORT_STATIC_ALLOCATION 1
```

---

## Interview Questions

**Q1: What are the main limitations of a bare-metal superloop architecture?**
Latency coupling (all tasks share one loop period), no prioritization (critical tasks cannot preempt), timing jitter (variable loop period), and poor scalability (adding tasks affects timing of all others). An RTOS solves these with preemptive multitasking and blocking primitives.

**Q2: Describe the four task states in FreeRTOS.**
Running: currently executing on the CPU (one per core). Ready: can run but waiting for the scheduler. Blocked: waiting for an event (semaphore, queue, delay) -- consumes no CPU. Suspended: explicitly paused, will not run until resumed.

**Q3: What is the difference between a binary semaphore and a mutex in FreeRTOS?**
Both are binary (taken/given), but a mutex has priority inheritance: when a high-priority task blocks on a mutex held by a low-priority task, the holder's priority is temporarily raised. Binary semaphores lack this, making them unsuitable for mutual exclusion. Use binary semaphores for ISR-to-task signaling, mutexes for protecting shared resources.

**Q4: Explain priority inversion and how priority inheritance solves it.**
Priority inversion occurs when a high-priority task is blocked by a low-priority task holding a shared resource, while medium-priority tasks preempt the low-priority task, indirectly blocking the high-priority task. Priority inheritance temporarily boosts the low-priority holder to the high-priority level, preventing medium-priority tasks from preempting it and minimizing the inversion duration.

**Q5: What happened with priority inversion on the Mars Pathfinder?**
A low-priority meteorological task held a shared bus mutex. The high-priority bus management task needed it and blocked. A medium-priority communications task preempted the meteorological task, extending the block time. The watchdog timer expired, triggering a system reset. The fix was enabling priority inheritance on the VxWorks RTOS mutex, uploaded remotely to Mars.

**Q6: How does `vTaskDelayUntil()` differ from `vTaskDelay()`?**
`vTaskDelay()` delays for a specified number of ticks from the current moment, leading to drift if the task takes variable time before calling it. `vTaskDelayUntil()` delays until an absolute tick count, providing consistent period regardless of task execution time. Use `vTaskDelayUntil()` for periodic tasks.

**Q7: What is the Rate Monotonic Scheduling policy and when is it optimal?**
RMS assigns priorities based on period: shorter period gets higher priority. It is optimal among fixed-priority scheduling algorithms -- if any fixed-priority assignment can schedule a task set without deadline misses, RMS can too. The schedulability bound is N \* (2^(1/N) - 1), approaching ln(2) = 69.3% for many tasks.

**Q8: A FreeRTOS system has three tasks. Task A (priority 5) runs every 10 ms for 1 ms. Task B (priority 3) runs every 50 ms for 10 ms. Task C (priority 1) runs every 100 ms for 20 ms. Is this schedulable under RMS?**
U = 1/10 + 10/50 + 20/100 = 0.1 + 0.2 + 0.2 = 0.5. The RMS bound for N=3 is 0.780. Since 0.5 < 0.780, the task set is schedulable. The priority assignment (A > B > C) matches RMS since A has the shortest period.

**Q9: What are the consequences of stack overflow in an RTOS task?**
The task writes beyond its stack boundary into adjacent memory, potentially corrupting another task's stack, a kernel data structure, or heap memory. Symptoms include random crashes, hard faults, corrupted variables, and watchdog resets. Use `configCHECK_FOR_STACK_OVERFLOW` and `uxTaskGetStackHighWaterMark()` to detect and prevent this.

**Q10: When would you use static allocation over dynamic allocation in FreeRTOS?**
Static allocation is preferred in safety-critical or high-reliability systems where heap fragmentation and allocation failures are unacceptable. All memory is determined at compile time, making the system fully deterministic. Dynamic allocation is simpler for prototyping and systems where tasks are created and destroyed at runtime.

**Q11: Explain how FreeRTOS event groups work and give a use case.**
Event groups are a set of bits (up to 24 in a 32-bit implementation). Tasks can set, clear, and wait for specific bit combinations with AND/OR logic. Use case: a cloud reporting task waits for WiFi connected AND MQTT connected AND sensor initialized before starting. Each subsystem sets its bit when ready.

**Q12: What is the difference between FreeRTOS heap_1 and heap_4?**
heap_1 only allocates, never frees -- suitable when all objects are created at startup. heap_4 supports allocation and freeing with first-fit algorithm and coalesces adjacent free blocks to reduce fragmentation. heap_4 is the most common choice for general-purpose applications.

**Q13: How do you safely communicate between an ISR and a task in FreeRTOS?**
Use `FromISR` API variants: `xSemaphoreGiveFromISR()`, `xQueueSendFromISR()`, etc. These never block and use a `pxHigherPriorityTaskWoken` parameter to request a context switch. After the ISR, call `portYIELD_FROM_ISR()` if a higher-priority task was woken. Never call blocking API functions from an ISR.

**Q14: What is the idle task in FreeRTOS and what is it used for?**
The idle task runs at priority 0 when no other task is ready. It handles cleanup of deleted tasks (freeing their memory). You can hook into it via `vApplicationIdleHook()` to implement low-power sleep modes -- putting the MCU into a sleep state until the next tick interrupt.

**Q15: How would you debug a deadlock in a FreeRTOS application?**
Enable `configUSE_TRACE_FACILITY` and use `vTaskList()` to print all tasks and their states. Tasks stuck in "Blocked" indefinitely suggest deadlock. Check which mutexes they are waiting for using `xSemaphoreGetMutexHolder()`. Prevention: always acquire multiple mutexes in a consistent global order, use timeouts instead of `portMAX_DELAY`, and minimize critical section length.
