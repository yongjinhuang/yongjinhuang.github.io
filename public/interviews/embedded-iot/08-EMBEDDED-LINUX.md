# Chapter 8: Embedded Linux -- Linux on Small Devices

When a project outgrows the constraints of a bare-metal RTOS -- when it needs a filesystem, networking stack, display server, or package management -- embedded Linux becomes the natural choice. This chapter covers the entire journey from cross-compilation to custom Linux images using Yocto and Buildroot, with practical focus on boot sequences, device trees, kernel modules, and debugging.

---

## 1. When to Use Embedded Linux vs. RTOS

### 1.1 Decision Matrix

| Criterion | RTOS / Bare-Metal | Embedded Linux |
|-----------|-------------------|----------------|
| Boot time | < 100 ms | 2-30 seconds |
| RAM required | 4 KB - 512 KB | 16 MB - 1 GB |
| Storage required | 64 KB - 2 MB | 8 MB - 2 GB |
| Real-time guarantees | Deterministic (< 10 us) | Soft RT with PREEMPT_RT |
| Filesystem | None / littlefs / FAT | ext4, SquashFS, UBIFS |
| Networking | lwIP (limited) | Full TCP/IP + WiFi/BT |
| USB host support | Limited | Comprehensive |
| Display / GUI | LVGL, basic | Qt, GTK, Wayland |
| Development ecosystem | Vendor SDKs | apt, pip, cargo, etc. |
| Security updates | Manual firmware OTA | Package manager updates |
| Power consumption | Micro-amps sleep | Milliamps minimum |
| Certification (safety) | Easier to certify | Harder (large codebase) |
| Typical processors | Cortex-M, RISC-V MCUs | Cortex-A, MIPS, RISC-V MPUs |

### 1.2 The Middle Ground

Some projects use both: a Cortex-A running Linux for connectivity and UI, paired with a Cortex-M running an RTOS for real-time sensor processing. Examples: STM32MP1 (Cortex-A7 + Cortex-M4), NXP i.MX 8M (Cortex-A53 + Cortex-M4).

---

## 2. Cross-Compilation Toolchains

### 2.1 What Is Cross-Compilation?

Cross-compilation builds binaries on a host machine (x86_64 desktop) that run on a different target architecture (ARM, MIPS, RISC-V).

```
+----------------------------------------------------------+
|           CROSS-COMPILATION FLOW                          |
+----------------------------------------------------------+
|                                                            |
|  Host (x86_64 Ubuntu)         Target (ARM Cortex-A7)      |
|  +-----------------------+    +---------------------+      |
|  | arm-linux-gnueabihf-  |    | hello_world         |      |
|  | gcc hello.c           |--->| (ARM ELF binary)    |      |
|  | -o hello_world        |    |                     |      |
|  +-----------------------+    +---------------------+      |
|                                                            |
|  Toolchain triplet: arm-linux-gnueabihf                    |
|    arm    = architecture                                   |
|    linux  = operating system                               |
|    gnueabihf = ABI (GNU, hard-float)                       |
+----------------------------------------------------------+
```

### 2.2 Installing a Toolchain

```bash
# Debian/Ubuntu -- install ARM cross-compiler
sudo apt install gcc-arm-linux-gnueabihf g++-arm-linux-gnueabihf

# Verify
arm-linux-gnueabihf-gcc --version

# For 64-bit ARM (AArch64)
sudo apt install gcc-aarch64-linux-gnu

# Compile a simple program
arm-linux-gnueabihf-gcc -o hello hello.c
file hello
# hello: ELF 32-bit LSB executable, ARM, EABI5 ...
```

### 2.3 CMake Cross-Compilation

```cmake
# toolchain-arm.cmake
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR arm)

set(CMAKE_C_COMPILER   arm-linux-gnueabihf-gcc)
set(CMAKE_CXX_COMPILER arm-linux-gnueabihf-g++)

set(CMAKE_FIND_ROOT_PATH /usr/arm-linux-gnueabihf)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
```

```bash
# Build with the toolchain file
mkdir build && cd build
cmake -DCMAKE_TOOLCHAIN_FILE=../toolchain-arm.cmake ..
make -j$(nproc)
```

---

## 3. Boot Process

### 3.1 The Four Stages

```
+----------------------------------------------------------+
|              EMBEDDED LINUX BOOT SEQUENCE                  |
+----------------------------------------------------------+
|                                                            |
|  Stage 0: ROM Bootloader (in silicon)                      |
|  +---------------------------------------------------+    |
|  | - Hardcoded in chip ROM, cannot be modified        |    |
|  | - Reads boot pins / eFuses to determine boot media |    |
|  | - Loads SPL/MLO from SD card, eMMC, or NAND        |    |
|  | - May verify signature (secure boot)               |    |
|  +---------------------------------------------------+    |
|                         |                                  |
|                         v                                  |
|  Stage 1: SPL / MLO (Secondary Program Loader)            |
|  +---------------------------------------------------+    |
|  | - Fits in internal SRAM (32-128 KB)                |    |
|  | - Initializes external DRAM controller             |    |
|  | - Loads full U-Boot into DRAM                      |    |
|  +---------------------------------------------------+    |
|                         |                                  |
|                         v                                  |
|  Stage 2: U-Boot (Universal Bootloader)                    |
|  +---------------------------------------------------+    |
|  | - Full bootloader with shell, networking, FS       |    |
|  | - Loads kernel image (zImage/Image) into RAM       |    |
|  | - Loads device tree blob (DTB) into RAM            |    |
|  | - Passes kernel command line and DTB address       |    |
|  | - Calls bootz / booti to transfer control          |    |
|  +---------------------------------------------------+    |
|                         |                                  |
|                         v                                  |
|  Stage 3: Linux Kernel                                     |
|  +---------------------------------------------------+    |
|  | - Decompresses itself (if zImage)                  |    |
|  | - Parses device tree for hardware description      |    |
|  | - Initializes memory, interrupts, drivers          |    |
|  | - Mounts root filesystem                           |    |
|  | - Executes /sbin/init (or systemd)                 |    |
|  +---------------------------------------------------+    |
|                         |                                  |
|                         v                                  |
|  Stage 4: Init System (systemd / BusyBox init)             |
|  +---------------------------------------------------+    |
|  | - Starts system services                           |    |
|  | - Mounts filesystems from /etc/fstab               |    |
|  | - Launches application daemons                     |    |
|  | - Spawns login shell / GUI                         |    |
|  +---------------------------------------------------+    |
|                                                            |
+----------------------------------------------------------+
```

### 3.2 U-Boot Commands

```bash
# Common U-Boot console commands
printenv                    # Show all environment variables
setenv bootargs 'console=ttyS0,115200 root=/dev/mmcblk0p2 rw'
setenv bootcmd 'load mmc 0:1 0x42000000 zImage; \
                load mmc 0:1 0x43000000 board.dtb; \
                bootz 0x42000000 - 0x43000000'
saveenv                     # Write env to persistent storage

# Boot from SD card
mmc dev 0
fatload mmc 0:1 0x42000000 zImage
fatload mmc 0:1 0x43000000 am335x-boneblack.dtb
bootz 0x42000000 - 0x43000000

# Boot from network (TFTP)
setenv ipaddr 192.168.1.100
setenv serverip 192.168.1.1
tftp 0x42000000 zImage
tftp 0x43000000 board.dtb
bootz 0x42000000 - 0x43000000
```

---

## 4. Device Tree

### 4.1 Why Device Tree Exists

ARM systems (unlike x86 with ACPI/PCI) cannot auto-discover hardware. The device tree is a data structure that describes the hardware topology so the kernel does not need board-specific C code for every variant.

### 4.2 DTS Syntax

```dts
/* board.dts -- simplified example */
/dts-v1/;

/ {
    compatible = "vendor,my-board";
    model = "My Custom Board";

    /* CPU cluster */
    cpus {
        cpu@0 {
            compatible = "arm,cortex-a7";
            device_type = "cpu";
            reg = <0>;
            clock-frequency = <800000000>;
        };
    };

    /* Memory */
    memory@80000000 {
        device_type = "memory";
        reg = <0x80000000 0x20000000>;  /* 512 MB at 0x80000000 */
    };

    /* I2C bus with a temperature sensor */
    i2c1: i2c@4802a000 {
        compatible = "ti,omap4-i2c";
        reg = <0x4802a000 0x1000>;
        #address-cells = <1>;
        #size-cells = <0>;
        clock-frequency = <400000>;     /* 400 kHz Fast Mode */
        status = "okay";

        temp_sensor: tmp102@48 {
            compatible = "ti,tmp102";
            reg = <0x48>;               /* I2C address */
        };
    };

    /* SPI bus */
    spi0: spi@48030000 {
        compatible = "ti,omap4-mcspi";
        reg = <0x48030000 0x400>;
        #address-cells = <1>;
        #size-cells = <0>;
        status = "okay";

        flash@0 {
            compatible = "jedec,spi-nor";
            reg = <0>;                  /* Chip select 0 */
            spi-max-frequency = <24000000>;
        };
    };
};
```

### 4.3 Device Tree Structure

```
+----------------------------------------------------------+
|              DEVICE TREE HIERARCHY                         |
+----------------------------------------------------------+
|                                                            |
|  / (root node)                                             |
|  |-- model = "My Custom Board"                             |
|  |-- compatible = "vendor,my-board"                        |
|  |                                                         |
|  |-- cpus/                                                 |
|  |   |-- cpu@0                                             |
|  |       |-- compatible = "arm,cortex-a7"                  |
|  |       |-- clock-frequency = <800000000>                 |
|  |                                                         |
|  |-- memory@80000000                                       |
|  |   |-- reg = <0x80000000 0x20000000>                     |
|  |                                                         |
|  |-- i2c@4802a000                                          |
|  |   |-- compatible = "ti,omap4-i2c"                       |
|  |   |-- clock-frequency = <400000>                        |
|  |   |-- tmp102@48                                         |
|  |       |-- compatible = "ti,tmp102"                      |
|  |                                                         |
|  |-- spi@48030000                                          |
|      |-- flash@0                                           |
|          |-- compatible = "jedec,spi-nor"                   |
|          |-- spi-max-frequency = <24000000>                 |
+----------------------------------------------------------+
```

### 4.4 Device Tree Overlays

Overlays modify the base device tree at runtime without recompiling the entire DTS. Common on Raspberry Pi for enabling hardware:

```dts
/* spi-enable-overlay.dts */
/dts-v1/;
/plugin/;

/ {
    fragment@0 {
        target = <&spi0>;
        __overlay__ {
            status = "okay";

            my_device@0 {
                compatible = "my-vendor,my-spi-device";
                reg = <0>;
                spi-max-frequency = <1000000>;
            };
        };
    };
};
```

```bash
# Compile overlay
dtc -@ -I dts -O dtb -o spi-enable.dtbo spi-enable-overlay.dts

# On Raspberry Pi, add to /boot/config.txt:
# dtoverlay=spi-enable
```

### 4.5 Compiling Device Trees

```bash
# DTS -> DTB (binary)
dtc -I dts -O dtb -o board.dtb board.dts

# DTB -> DTS (decompile for inspection)
dtc -I dtb -O dts -o board_decompiled.dts board.dtb

# In-kernel build
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- dtbs
```

---

## 5. Kernel Configuration and Building

### 5.1 Getting the Source

```bash
# Clone mainline kernel
git clone --depth=1 https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git

# Or use a vendor kernel (e.g., Raspberry Pi)
git clone --depth=1 https://github.com/raspberrypi/linux.git
```

### 5.2 Configuration

```bash
# Start from a default config for your platform
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- multi_v7_defconfig

# Interactive menu configuration
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- menuconfig

# Key sections to configure:
#   General Setup -> Local version string
#   Processor type -> ARM Cortex-A7
#   Device Drivers -> I2C, SPI, GPIO
#   File Systems -> ext4, SquashFS
#   Networking -> TCP/IP, WiFi
```

### 5.3 Building

```bash
# Build kernel image
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- zImage -j$(nproc)

# Build device tree blobs
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- dtbs

# Build kernel modules
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- modules -j$(nproc)

# Install modules to a staging directory
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- \
     INSTALL_MOD_PATH=./modules_install modules_install
```

---

## 6. Kernel Modules

### 6.1 Hello World Module

```c
/* hello_module.c */
#include <linux/init.h>
#include <linux/module.h>
#include <linux/kernel.h>

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Engineer");
MODULE_DESCRIPTION("Hello World Kernel Module");
MODULE_VERSION("1.0");

static char *whom = "world";
module_param(whom, charp, 0644);
MODULE_PARM_DESC(whom, "Whom to greet");

static int __init hello_init(void)
{
    pr_info("hello: Hello, %s! Module loaded.\n", whom);
    return 0;
}

static void __exit hello_exit(void)
{
    pr_info("hello: Goodbye, %s! Module unloaded.\n", whom);
}

module_init(hello_init);
module_exit(hello_exit);
```

```makefile
# Makefile for out-of-tree module
obj-m += hello_module.o

KDIR := /lib/modules/$(shell uname -r)/build

all:
	$(MAKE) -C $(KDIR) M=$(PWD) modules

clean:
	$(MAKE) -C $(KDIR) M=$(PWD) clean

# Cross-compile variant:
# $(MAKE) -C $(KDIR) M=$(PWD) ARCH=arm \
#     CROSS_COMPILE=arm-linux-gnueabihf- modules
```

```bash
# Load and test
sudo insmod hello_module.ko whom="embedded"
dmesg | tail -1
# [12345.678] hello: Hello, embedded! Module loaded.

sudo rmmod hello_module
dmesg | tail -1
# [12346.789] hello: Goodbye, embedded! Module unloaded.

# List loaded modules
lsmod | grep hello
```

### 6.2 Character Device Driver

```c
/* chardev.c -- minimal character device */
#include <linux/init.h>
#include <linux/module.h>
#include <linux/fs.h>
#include <linux/cdev.h>
#include <linux/uaccess.h>

#define DEVICE_NAME "mychardev"
#define BUF_SIZE    256

MODULE_LICENSE("GPL");

static dev_t dev_num;
static struct cdev my_cdev;
static struct class *my_class;
static char device_buffer[BUF_SIZE];
static int buffer_len;

static int dev_open(struct inode *inode, struct file *file)
{
    pr_info("chardev: Device opened\n");
    return 0;
}

static ssize_t dev_read(struct file *file, char __user *buf,
                        size_t count, loff_t *offset)
{
    int bytes_to_read;

    if (*offset >= buffer_len)
        return 0;

    bytes_to_read = min((int)count, buffer_len - (int)*offset);
    if (copy_to_user(buf, device_buffer + *offset, bytes_to_read))
        return -EFAULT;

    *offset += bytes_to_read;
    return bytes_to_read;
}

static ssize_t dev_write(struct file *file, const char __user *buf,
                         size_t count, loff_t *offset)
{
    int bytes_to_write = min((int)count, BUF_SIZE - 1);

    if (copy_from_user(device_buffer, buf, bytes_to_write))
        return -EFAULT;

    device_buffer[bytes_to_write] = '\0';
    buffer_len = bytes_to_write;
    pr_info("chardev: Received %d bytes\n", bytes_to_write);
    return bytes_to_write;
}

static long dev_ioctl(struct file *file, unsigned int cmd,
                      unsigned long arg)
{
    switch (cmd) {
    case 0x01:  /* Clear buffer */
        memset(device_buffer, 0, BUF_SIZE);
        buffer_len = 0;
        pr_info("chardev: Buffer cleared via ioctl\n");
        return 0;
    default:
        return -EINVAL;
    }
}

static int dev_release(struct inode *inode, struct file *file)
{
    pr_info("chardev: Device closed\n");
    return 0;
}

static const struct file_operations fops = {
    .owner          = THIS_MODULE,
    .open           = dev_open,
    .read           = dev_read,
    .write          = dev_write,
    .unlocked_ioctl = dev_ioctl,
    .release        = dev_release,
};

static int __init chardev_init(void)
{
    /* Allocate device number dynamically */
    if (alloc_chrdev_region(&dev_num, 0, 1, DEVICE_NAME) < 0)
        return -1;

    /* Create device class (visible in /sys/class/) */
    my_class = class_create(DEVICE_NAME);
    if (IS_ERR(my_class)) {
        unregister_chrdev_region(dev_num, 1);
        return PTR_ERR(my_class);
    }

    /* Create device node (visible in /dev/) */
    device_create(my_class, NULL, dev_num, NULL, DEVICE_NAME);

    /* Initialize and add character device */
    cdev_init(&my_cdev, &fops);
    if (cdev_add(&my_cdev, dev_num, 1) < 0) {
        device_destroy(my_class, dev_num);
        class_destroy(my_class);
        unregister_chrdev_region(dev_num, 1);
        return -1;
    }

    pr_info("chardev: Registered with major=%d minor=%d\n",
            MAJOR(dev_num), MINOR(dev_num));
    return 0;
}

static void __exit chardev_exit(void)
{
    cdev_del(&my_cdev);
    device_destroy(my_class, dev_num);
    class_destroy(my_class);
    unregister_chrdev_region(dev_num, 1);
    pr_info("chardev: Unregistered\n");
}

module_init(chardev_init);
module_exit(chardev_exit);
```

```bash
# Test the character device
sudo insmod chardev.ko
echo "Hello from userspace" | sudo tee /dev/mychardev
sudo cat /dev/mychardev
# Hello from userspace
sudo rmmod chardev
```

---

## 7. Root Filesystem

### 7.1 BusyBox Minimal Root FS

BusyBox combines tiny versions of common Unix utilities into a single binary (~1 MB):

```bash
# Build BusyBox for ARM
git clone https://git.busybox.net/busybox
cd busybox
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- defconfig
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- menuconfig
# Enable: Settings -> Build static binary (no shared libs)
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- -j$(nproc)
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- \
     CONFIG_PREFIX=../rootfs install

# Create minimal root filesystem structure
cd ../rootfs
mkdir -p proc sys dev etc/init.d tmp var/log

# Create init script
cat > etc/init.d/rcS << 'INITEOF'
#!/bin/sh
mount -t proc proc /proc
mount -t sysfs sysfs /sys
mount -t devtmpfs devtmpfs /dev
echo "System initialized."
INITEOF
chmod +x etc/init.d/rcS

# Create inittab
cat > etc/inittab << 'INITTAB'
::sysinit:/etc/init.d/rcS
::respawn:-/bin/sh
::shutdown:/bin/umount -a -r
INITTAB

# Package as initramfs
find . | cpio -H newc -o | gzip > ../rootfs.cpio.gz
```

---

## 8. Yocto Project

### 8.1 Overview

The Yocto Project is an open-source collaboration that produces tools and metadata for building custom Linux distributions for embedded devices. It is the industry standard for production embedded Linux.

### 8.2 Key Concepts

| Term | Description |
|------|-------------|
| **Recipe** (.bb) | Instructions to build a single package |
| **Layer** | Collection of recipes organized by purpose |
| **BitBake** | The build engine (like make on steroids) |
| **BSP Layer** | Board Support Package -- machine-specific recipes |
| **Distro Layer** | Distribution policy (init system, libc, features) |
| **Image Recipe** | Defines what packages go into the final rootfs |
| **MACHINE** | Target hardware (e.g., raspberrypi4, beaglebone) |
| **DISTRO** | Distribution configuration (e.g., poky) |

### 8.3 Layer Architecture

```
+----------------------------------------------------------+
|              YOCTO LAYER ARCHITECTURE                      |
+----------------------------------------------------------+
|                                                            |
|  +----------------------------------------------------+   |
|  |  meta-my-product   (your product layer)             |   |
|  |  - Custom application recipes                       |   |
|  |  - Product-specific configuration                   |   |
|  |  - Custom image recipes                             |   |
|  +----------------------------------------------------+   |
|                         |                                  |
|  +----------------------------------------------------+   |
|  |  meta-my-bsp   (your BSP layer)                     |   |
|  |  - Machine configuration                            |   |
|  |  - Kernel patches                                   |   |
|  |  - U-Boot customization                             |   |
|  |  - Device tree files                                |   |
|  +----------------------------------------------------+   |
|                         |                                  |
|  +----------------------------------------------------+   |
|  |  meta-openembedded   (community recipes)            |   |
|  |  - meta-oe: general-purpose recipes                 |   |
|  |  - meta-networking: networking tools                 |   |
|  |  - meta-python: Python packages                     |   |
|  +----------------------------------------------------+   |
|                         |                                  |
|  +----------------------------------------------------+   |
|  |  poky   (reference distribution)                    |   |
|  |  - meta: core recipes (glibc, gcc, coreutils)       |   |
|  |  - meta-poky: reference distro config               |   |
|  |  - meta-yocto-bsp: reference BSP                    |   |
|  +----------------------------------------------------+   |
|                                                            |
+----------------------------------------------------------+
```

### 8.4 Setting Up a Yocto Build

```bash
# Clone Poky (reference distribution)
git clone -b scarthgap git://git.yoctoproject.org/poky
cd poky

# Initialize build environment
source oe-init-build-env build

# This creates:
#   build/conf/local.conf   -- local build settings
#   build/conf/bblayers.conf -- layer configuration

# Edit local.conf
# MACHINE = "raspberrypi4-64"
# DISTRO = "poky"
# PACKAGE_CLASSES = "package_ipk"

# Add BSP layer
bitbake-layers add-layer ../meta-raspberrypi

# Build a minimal image
bitbake core-image-minimal
# This takes 1-4 hours on first build (downloads + compiles everything)

# Output image location:
# tmp/deploy/images/raspberrypi4-64/core-image-minimal-raspberrypi4-64.wic.bz2
```

### 8.5 Writing a Custom Recipe

```bash
# meta-my-product/recipes-apps/my-daemon/my-daemon_1.0.bb
SUMMARY = "My custom IoT daemon"
DESCRIPTION = "Background service that reads sensors and reports to cloud"
LICENSE = "MIT"
LIC_FILES_CHKSUM = "file://LICENSE;md5=abc123..."

SRC_URI = "file://my-daemon.c \
           file://my-daemon.service"

S = "${WORKDIR}"

do_compile() {
    ${CC} ${CFLAGS} ${LDFLAGS} -o my-daemon my-daemon.c -lssl -lcrypto
}

do_install() {
    install -d ${D}${bindir}
    install -m 0755 my-daemon ${D}${bindir}

    install -d ${D}${systemd_system_unitdir}
    install -m 0644 my-daemon.service ${D}${systemd_system_unitdir}
}

inherit systemd
SYSTEMD_SERVICE:${PN} = "my-daemon.service"
```

### 8.6 Custom Image Recipe

```bash
# meta-my-product/recipes-core/images/my-product-image.bb
SUMMARY = "My Product Image"

inherit core-image

IMAGE_INSTALL:append = " \
    my-daemon \
    openssh-sftp-server \
    python3 \
    i2c-tools \
    can-utils \
    "

IMAGE_FEATURES:append = " \
    ssh-server-openssh \
    package-management \
    "

# Set root password
EXTRA_IMAGE_FEATURES:append = " debug-tweaks"

# Image size
IMAGE_ROOTFS_EXTRA_SPACE = "524288"
```

---

## 9. Buildroot

### 9.1 Buildroot vs. Yocto

| Aspect | Buildroot | Yocto |
|--------|-----------|-------|
| Learning curve | Gentle | Steep |
| Build time | 15-60 min | 1-4 hours |
| Package count | ~2,500 | ~10,000+ |
| Customization | menuconfig | Recipes + layers |
| Incremental builds | Full rebuild | Smart caching (sstate) |
| Best for | Simple products | Complex, long-lived products |

### 9.2 Buildroot Workflow

```bash
# Clone Buildroot
git clone https://git.buildroot.net/buildroot
cd buildroot

# Configure for Raspberry Pi 4
make raspberrypi4_64_defconfig

# Interactive configuration
make menuconfig
# Target options -> Target Architecture: AArch64
# Toolchain -> C library: glibc
# System configuration -> Root password: mypass
# Target packages -> Networking -> dropbear (SSH)
# Filesystem images -> ext4

# Build everything (kernel, rootfs, toolchain)
make -j$(nproc)

# Output
ls output/images/
# sdcard.img  rootfs.ext4  Image  bcm2711-rpi-4-b.dtb
```

---

## 10. Raspberry Pi Specifics

### 10.1 GPIO Access Methods

**Method 1: sysfs (deprecated but still common)**

```bash
# Export GPIO 17
echo 17 > /sys/class/gpio/export
echo out > /sys/class/gpio/gpio17/direction
echo 1 > /sys/class/gpio/gpio17/value   # Turn on
echo 0 > /sys/class/gpio/gpio17/value   # Turn off
echo 17 > /sys/class/gpio/unexport
```

**Method 2: libgpiod (modern, preferred)**

```bash
# Install
sudo apt install gpiod libgpiod-dev

# Command-line tools
gpiodetect                   # List GPIO chips
gpioinfo gpiochip0           # List lines on chip 0
gpioset gpiochip0 17=1       # Set GPIO 17 high
gpioget gpiochip0 27         # Read GPIO 27
gpiomon gpiochip0 22         # Monitor GPIO 22 for events
```

```c
/* gpio_example.c -- libgpiod API */
#include <gpiod.h>
#include <stdio.h>
#include <unistd.h>

#define GPIO_CHIP "/dev/gpiochip0"
#define LED_PIN   17

int main(void)
{
    struct gpiod_chip *chip;
    struct gpiod_line *led;

    chip = gpiod_chip_open(GPIO_CHIP);
    if (!chip) {
        perror("gpiod_chip_open");
        return 1;
    }

    led = gpiod_chip_get_line(chip, LED_PIN);
    if (!led) {
        perror("gpiod_chip_get_line");
        gpiod_chip_close(chip);
        return 1;
    }

    if (gpiod_line_request_output(led, "my-app", 0) < 0) {
        perror("gpiod_line_request_output");
        gpiod_chip_close(chip);
        return 1;
    }

    /* Blink LED 5 times */
    for (int i = 0; i < 5; i++) {
        gpiod_line_set_value(led, 1);
        sleep(1);
        gpiod_line_set_value(led, 0);
        sleep(1);
    }

    gpiod_line_release(led);
    gpiod_chip_close(chip);
    return 0;
}
```

### 10.2 I2C from Userspace

```bash
# Enable I2C in /boot/config.txt
# dtparam=i2c_arm=on

# Install tools
sudo apt install i2c-tools

# Scan for devices
sudo i2cdetect -y 1

# Read a register (device 0x48, register 0x00)
sudo i2cget -y 1 0x48 0x00 w

# Write a register
sudo i2cset -y 1 0x48 0x01 0x60
```

```c
/* i2c_userspace.c -- reading a temperature sensor */
#include <fcntl.h>
#include <linux/i2c-dev.h>
#include <sys/ioctl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdint.h>

#define I2C_BUS   "/dev/i2c-1"
#define TMP102_ADDR 0x48

int main(void)
{
    int fd = open(I2C_BUS, O_RDWR);
    if (fd < 0) {
        perror("open");
        return 1;
    }

    if (ioctl(fd, I2C_SLAVE, TMP102_ADDR) < 0) {
        perror("ioctl");
        close(fd);
        return 1;
    }

    /* Read 2-byte temperature register */
    uint8_t reg = 0x00;
    write(fd, &reg, 1);

    uint8_t data[2];
    read(fd, data, 2);

    /* TMP102: 12-bit temperature, 0.0625 C resolution */
    int16_t raw = (data[0] << 4) | (data[1] >> 4);
    if (raw & 0x800) {
        raw |= 0xF000;  /* Sign extension */
    }
    float temp_c = raw * 0.0625f;

    printf("Temperature: %.2f C\n", temp_c);

    close(fd);
    return 0;
}
```

### 10.3 SPI from Userspace

```c
/* spi_userspace.c */
#include <fcntl.h>
#include <linux/spi/spidev.h>
#include <sys/ioctl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>

#define SPI_DEVICE "/dev/spidev0.0"

int main(void)
{
    int fd = open(SPI_DEVICE, O_RDWR);
    if (fd < 0) {
        perror("open");
        return 1;
    }

    /* Configure SPI */
    uint8_t mode = SPI_MODE_0;
    uint8_t bits = 8;
    uint32_t speed = 1000000;  /* 1 MHz */

    ioctl(fd, SPI_IOC_WR_MODE, &mode);
    ioctl(fd, SPI_IOC_WR_BITS_PER_WORD, &bits);
    ioctl(fd, SPI_IOC_WR_MAX_SPEED_HZ, &speed);

    /* Full-duplex transfer */
    uint8_t tx[] = {0x9F, 0x00, 0x00, 0x00};  /* Read JEDEC ID */
    uint8_t rx[4];
    memset(rx, 0, sizeof(rx));

    struct spi_ioc_transfer xfer = {
        .tx_buf = (unsigned long)tx,
        .rx_buf = (unsigned long)rx,
        .len = 4,
        .speed_hz = speed,
        .bits_per_word = bits,
    };

    if (ioctl(fd, SPI_IOC_MESSAGE(1), &xfer) < 0) {
        perror("SPI transfer");
        close(fd);
        return 1;
    }

    printf("JEDEC ID: %02X %02X %02X\n", rx[1], rx[2], rx[3]);

    close(fd);
    return 0;
}
```

---

## 11. Package Management on Embedded

### 11.1 opkg (Open Package Management)

Lightweight package manager used by Yocto / OpenWrt:

```bash
# Update package index
opkg update

# Install a package
opkg install python3

# List installed packages
opkg list-installed

# Remove a package
opkg remove python3

# Find which package owns a file
opkg search /usr/bin/python3
```

### 11.2 When to Use Package Management

- **Development / prototyping:** Install packages on-device for rapid iteration.
- **Production:** Pre-bake all packages into the image. Use read-only rootfs + overlay for reliability. Package management adds attack surface.

---

## 12. Debugging Embedded Linux

### 12.1 Remote GDB

```bash
# On target (install gdbserver)
gdbserver :2345 /usr/bin/my-app

# On host
arm-linux-gnueabihf-gdb my-app
(gdb) target remote 192.168.1.100:2345
(gdb) break main
(gdb) continue
(gdb) backtrace
(gdb) print variable_name
(gdb) info threads
```

### 12.2 strace

```bash
# Trace system calls made by a process
strace -f -e trace=open,read,write,ioctl /usr/bin/my-app

# Attach to a running process
strace -p $(pidof my-app) -e trace=network

# Count system calls
strace -c /usr/bin/my-app
```

### 12.3 perf

```bash
# Profile CPU usage
perf record -g /usr/bin/my-app
perf report

# Top-like live view
perf top

# Count hardware events
perf stat /usr/bin/my-app
```

### 12.4 Other Useful Tools

```bash
# Memory usage
free -h
cat /proc/meminfo

# Process memory map
cat /proc/<pid>/maps

# Device tree at runtime
ls /proc/device-tree/
cat /proc/device-tree/model

# Kernel log
dmesg | tail -50

# Kernel configuration of running kernel
zcat /proc/config.gz | grep CONFIG_SPI
```

---

## 13. Real-Time Linux (PREEMPT_RT)

### 13.1 Why PREEMPT_RT?

Standard Linux is not deterministic: a high-priority task can be delayed by kernel operations (interrupts, spinlocks, softirqs). The PREEMPT_RT patch converts most spinlocks to mutexes, makes interrupt handlers threaded, and enables full kernel preemption.

### 13.2 Latency Comparison

| Configuration | Worst-Case Latency | Use Case |
|---------------|-------------------|----------|
| Standard Linux | 1-10 ms | General embedded |
| PREEMPT_RT Linux | 20-100 us | Soft real-time |
| Dedicated RTOS (FreeRTOS) | 1-10 us | Hard real-time |
| Bare metal | < 1 us | Ultra-low latency |

### 13.3 Building with PREEMPT_RT

```bash
# Download matching PREEMPT_RT patch
wget https://cdn.kernel.org/pub/linux/kernel/projects/rt/6.1/patch-6.1.69-rt21.patch.xz

# Apply patch
cd linux-6.1.69
xzcat ../patch-6.1.69-rt21.patch.xz | patch -p1

# Configure
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- menuconfig
# General Setup -> Preemption Model -> Fully Preemptible Kernel (Real-Time)

# Build
make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- zImage -j$(nproc)
```

### 13.4 Testing Real-Time Performance

```bash
# Install cyclictest
sudo apt install rt-tests

# Run latency test (measures scheduling jitter)
sudo cyclictest -m -p90 -i200 -l10000
# T: 0 ( 1234) P:90 I:200 C:  10000 Min:      3 Act:    7 Avg:    5 Max:   42
#                                                                         ^^^^
#                                                     Worst-case latency: 42 us
```

---

## 14. Summary: Choosing Your Embedded Linux Stack

```
+----------------------------------------------------------+
|           DECISION FLOWCHART                               |
+----------------------------------------------------------+
|                                                            |
|  Need Linux? ---------> No ---------> Use RTOS             |
|       |                                                    |
|      Yes                                                   |
|       |                                                    |
|  Simple product? -----> Yes ---------> Buildroot           |
|       |                                                    |
|      No                                                    |
|       |                                                    |
|  Long-lived product? -> Yes ---------> Yocto               |
|  Need OTA updates?                                         |
|  Large team?                                               |
|       |                                                    |
|      No                                                    |
|       |                                                    |
|  Prototype / hobby? --> Yes ---------> Raspberry Pi OS     |
|                                        (Debian-based)      |
+----------------------------------------------------------+
```

---

## Interview Questions

**Q1: When would you choose embedded Linux over an RTOS?**
When the project needs a full TCP/IP stack, filesystem, USB host, display server, or package management. Linux is suitable when RAM exceeds 16 MB, boot time of a few seconds is acceptable, and hard real-time guarantees below 100 us are not required.

**Q2: Describe the embedded Linux boot sequence from power-on to userspace.**
ROM bootloader (in silicon) reads boot pins and loads SPL from boot media. SPL initializes DRAM and loads U-Boot. U-Boot loads the kernel image and device tree blob into RAM, passes the kernel command line, and transfers control. The kernel initializes hardware from the device tree, mounts the root filesystem, and executes init/systemd to start services.

**Q3: What is a device tree and why does ARM Linux need it?**
A device tree is a hierarchical data structure (.dts source, .dtb binary) that describes the hardware layout (CPUs, memory, peripherals, buses). ARM lacks PCI-like auto-discovery, so the kernel uses the device tree instead of hardcoding board-specific information in C. This allows one kernel binary to support multiple boards.

**Q4: Explain the difference between a device tree overlay and modifying the base DTS.**
The base DTS describes the SoC and board hardware. An overlay modifies or extends the base tree at boot time without recompiling the entire DTS. Overlays are used to enable optional hardware (SPI devices, HATs) and are loaded by the bootloader. This allows end users to customize hardware configuration without rebuilding the kernel.

**Q5: What is cross-compilation and why is it necessary for embedded Linux?**
Cross-compilation builds binaries on a host (x86_64 desktop) that execute on a different target architecture (ARM, MIPS). It is necessary because the target device typically lacks the CPU power, RAM, and storage to compile large projects (like the Linux kernel) natively. The toolchain triplet (e.g., arm-linux-gnueabihf) specifies architecture, OS, and ABI.

**Q6: How do you write and load a Linux kernel module?**
Write a C file with `module_init()` and `module_exit()` functions, a `MODULE_LICENSE()` macro, and a Makefile referencing the kernel build directory. Build with `make -C /lib/modules/.../build M=$(PWD) modules`. Load with `insmod module.ko`, verify with `lsmod` and `dmesg`, unload with `rmmod`.

**Q7: What is the difference between Yocto and Buildroot?**
Buildroot is simpler (menuconfig-based, ~2500 packages, 15-60 min builds) but does full rebuilds for changes and suits simple products. Yocto is more powerful (recipe/layer system, ~10000+ packages, sstate caching for incremental builds) but has a steeper learning curve and suits complex, long-lived products with large teams.

**Q8: Explain the Yocto layer system and why it matters.**
Layers are collections of recipes organized by purpose: BSP layers (machine-specific), distro layers (policy), and application layers (product features). Layers enable separation of concerns -- you can swap BSP layers to port to new hardware without changing application recipes. The layer system also allows upstream layers to be updated independently of your customizations.

**Q9: How would you debug a crash in an embedded Linux application?**
Use remote GDB: run `gdbserver :2345 ./app` on the target and connect from the host with the cross-GDB. Examine the backtrace, variable state, and thread info. For intermittent issues, use `strace` to trace system calls, `valgrind` for memory errors, or `core dumps` with `gdb` post-mortem analysis.

**Q10: What is the sysfs GPIO interface and why is it deprecated?**
Sysfs GPIO (`/sys/class/gpio/`) provides a filesystem-based interface to export and control GPIO pins using `echo` commands. It is deprecated because it is not atomic (race conditions between export and direction setting), does not support events efficiently, and has naming inconsistencies. The replacement is `libgpiod`, which uses the `/dev/gpiochipN` character device interface.

**Q11: How do you access I2C devices from Linux userspace?**
Open `/dev/i2c-N`, use `ioctl(fd, I2C_SLAVE, addr)` to set the device address, then use standard `read()` and `write()` system calls for register access. Alternatively, use `i2c-tools` (`i2cdetect`, `i2cget`, `i2cset`) for quick testing. For production, write a proper kernel driver with device tree binding.

**Q12: What is PREEMPT_RT and when would you use it?**
PREEMPT_RT is a kernel patch that converts spinlocks to mutexes, makes interrupt handlers threaded, and enables full kernel preemption. It reduces worst-case latency from milliseconds to tens of microseconds. Use it when you need soft real-time guarantees (motor control, audio processing) but also need Linux features (networking, filesystem). It does not match a dedicated RTOS for hard real-time (< 10 us).

**Q13: Describe how you would create a minimal root filesystem for an embedded Linux device.**
Cross-compile BusyBox as a static binary, install to a staging directory, create essential directories (proc, sys, dev, etc), write an init script that mounts proc/sysfs/devtmpfs, create an inittab, then package everything as a cpio initramfs or ext4 image. This produces a functional root filesystem under 5 MB.

**Q14: What is a BSP layer in Yocto and what does it contain?**
A BSP (Board Support Package) layer contains machine-specific recipes and configuration: machine config files (defining CPU, boot media, serial console), kernel configuration fragments or patches, U-Boot customization, device tree files, and firmware blobs (WiFi, GPU). It maps to a MACHINE variable (e.g., "raspberrypi4") and is swappable to port the product to different hardware.

**Q15: How would you reduce the boot time of an embedded Linux system?**
Use a minimal initramfs instead of a full rootfs for initial boot. Remove unnecessary kernel modules and drivers. Use a compressed kernel (LZ4 for speed over size). Skip U-Boot's autoboot delay. Use systemd's socket activation to defer service startup. Profile with `systemd-analyze blame` or `grabserial`. Consider using a simpler init system (BusyBox init) instead of systemd. Hardware-level: use faster boot media (eMMC vs. SD card).
