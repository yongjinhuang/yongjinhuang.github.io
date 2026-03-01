# Go & Python Backend Patterns

## Overview

Go and Python are two of the most popular backend languages, and they occupy complementary niches. Go excels at high-concurrency services, network programming, and infrastructure tooling. Python excels at rapid development, data processing, and ML/AI workloads. Many production systems use both -- Go for performance-critical services and Python for business logic, data pipelines, and ML. Full-stack interviews increasingly test backend knowledge beyond Node.js, and understanding Go and Python patterns shows breadth and the ability to choose the right tool for the job.

This guide covers Go patterns (Gin framework, goroutines, channels, context, error handling, interfaces, dependency injection, project layout), Python patterns (Django ORM, DRF serializers, middleware, signals, Celery tasks, type hints), and when to choose which language.

---

## Core Concepts

### Go Patterns

#### 1. Project Layout

Go projects follow a conventional layout. While there is no enforced structure, the community has converged on patterns inspired by the `golang-standards/project-layout` repository.

```
myservice/
├── cmd/
│   └── server/
│       └── main.go           # Entry point
├── internal/                  # Private application code
│   ├── handler/               # HTTP handlers
│   │   └── order.go
│   ├── service/               # Business logic
│   │   └── order.go
│   ├── repository/            # Data access
│   │   └── order.go
│   ├── model/                 # Domain types
│   │   └── order.go
│   └── middleware/            # HTTP middleware
│       ├── auth.go
│       └── logging.go
├── pkg/                       # Public library code (importable by others)
│   └── pagination/
│       └── pagination.go
├── config/                    # Configuration loading
│   └── config.go
├── migrations/                # Database migrations
├── go.mod
├── go.sum
└── Makefile
```

**Key conventions:**

- `cmd/` contains the main entry point(s). One `main.go` per binary.
- `internal/` is enforced by the Go compiler -- code here cannot be imported by other modules.
- `pkg/` is for code that is safe for external consumption.
- Business logic lives in `service/`, not in HTTP handlers.

#### 2. Gin Framework

Gin is the most popular Go web framework, known for its performance and middleware-based architecture.

```go
// cmd/server/main.go
package main

import (
    "log"
    "myservice/config"
    "myservice/internal/handler"
    "myservice/internal/middleware"
    "myservice/internal/repository"
    "myservice/internal/service"
    "github.com/gin-gonic/gin"
)

func main() {
    cfg := config.Load()

    db := repository.NewPostgresDB(cfg.DatabaseURL)
    defer db.Close()

    orderRepo := repository.NewOrderRepository(db)
    orderSvc := service.NewOrderService(orderRepo)
    orderHandler := handler.NewOrderHandler(orderSvc)

    r := gin.Default()

    // Global middleware
    r.Use(middleware.RequestID())
    r.Use(middleware.Logger())
    r.Use(middleware.Recovery())

    // Routes
    api := r.Group("/api/v1")
    {
        api.Use(middleware.Auth(cfg.JWTSecret))
        api.GET("/orders", orderHandler.List)
        api.POST("/orders", orderHandler.Create)
        api.GET("/orders/:id", orderHandler.GetByID)
        api.PUT("/orders/:id", orderHandler.Update)
    }

    // Health check (no auth)
    r.GET("/health", handler.HealthCheck)

    log.Printf("Starting server on :%s", cfg.Port)
    if err := r.Run(":" + cfg.Port); err != nil {
        log.Fatalf("Failed to start server: %v", err)
    }
}
```

```go
// internal/handler/order.go
package handler

import (
    "net/http"
    "myservice/internal/model"
    "myservice/internal/service"
    "github.com/gin-gonic/gin"
)

type OrderHandler struct {
    service service.OrderService
}

func NewOrderHandler(svc service.OrderService) *OrderHandler {
    return &OrderHandler{service: svc}
}

func (h *OrderHandler) Create(c *gin.Context) {
    var input model.CreateOrderInput
    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    userID := c.GetString("userID") // Set by auth middleware
    order, err := h.service.CreateOrder(c.Request.Context(), userID, input)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create order"})
        return
    }

    c.JSON(http.StatusCreated, gin.H{"data": order})
}

func (h *OrderHandler) GetByID(c *gin.Context) {
    id := c.Param("id")
    order, err := h.service.GetByID(c.Request.Context(), id)
    if err != nil {
        if err == service.ErrNotFound {
            c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
            return
        }
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch order"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"data": order})
}

func (h *OrderHandler) List(c *gin.Context) {
    userID := c.GetString("userID")
    page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
    limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

    orders, total, err := h.service.ListByUser(c.Request.Context(), userID, page, limit)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list orders"})
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "data": orders,
        "meta": gin.H{"total": total, "page": page, "limit": limit},
    })
}
```

#### 3. Goroutines and Channels

Goroutines are lightweight threads managed by the Go runtime. Channels are the mechanism for goroutines to communicate safely.

```go
// Concurrent API calls with error handling
func fetchDashboardData(ctx context.Context, userID string) (*Dashboard, error) {
    type result struct {
        data interface{}
        err  error
    }

    profileCh := make(chan result, 1)
    ordersCh := make(chan result, 1)
    notifCh := make(chan result, 1)

    go func() {
        profile, err := userService.GetProfile(ctx, userID)
        profileCh <- result{data: profile, err: err}
    }()

    go func() {
        orders, err := orderService.GetRecent(ctx, userID, 5)
        ordersCh <- result{data: orders, err: err}
    }()

    go func() {
        notifications, err := notifService.GetUnread(ctx, userID)
        notifCh <- result{data: notifications, err: err}
    }()

    dashboard := &Dashboard{}

    profileResult := <-profileCh
    if profileResult.err != nil {
        return nil, fmt.Errorf("failed to fetch profile: %w", profileResult.err)
    }
    dashboard.Profile = profileResult.data.(*UserProfile)

    ordersResult := <-ordersCh
    if ordersResult.err != nil {
        return nil, fmt.Errorf("failed to fetch orders: %w", ordersResult.err)
    }
    dashboard.RecentOrders = ordersResult.data.([]*Order)

    notifResult := <-notifCh
    if notifResult.err != nil {
        return nil, fmt.Errorf("failed to fetch notifications: %w", notifResult.err)
    }
    dashboard.Notifications = notifResult.data.([]*Notification)

    return dashboard, nil
}
```

**Worker pool pattern:**

```go
// Process items concurrently with a limited number of workers
func processItems(ctx context.Context, items []Item, concurrency int) []Result {
    jobs := make(chan Item, len(items))
    results := make(chan Result, len(items))

    // Start workers
    var wg sync.WaitGroup
    for i := 0; i < concurrency; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for item := range jobs {
                select {
                case <-ctx.Done():
                    return
                default:
                    result := processItem(item)
                    results <- result
                }
            }
        }()
    }

    // Send jobs
    for _, item := range items {
        jobs <- item
    }
    close(jobs)

    // Wait for all workers to finish, then close results
    go func() {
        wg.Wait()
        close(results)
    }()

    // Collect results
    var output []Result
    for r := range results {
        output = append(output, r)
    }
    return output
}
```

#### 4. Context

`context.Context` is Go's mechanism for carrying deadlines, cancellation signals, and request-scoped values across API boundaries and goroutines.

```go
// Propagating context through the stack
func (h *OrderHandler) Create(c *gin.Context) {
    // Gin provides a context with the request's lifecycle
    ctx := c.Request.Context()

    // Add a timeout for this operation
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()

    order, err := h.service.CreateOrder(ctx, input)
    // If ctx times out, downstream operations receive cancellation
}

func (s *OrderService) CreateOrder(ctx context.Context, input CreateOrderInput) (*Order, error) {
    // Check if context is already cancelled
    select {
    case <-ctx.Done():
        return nil, ctx.Err()
    default:
    }

    // Pass context to database operations
    order, err := s.repo.Create(ctx, input)
    if err != nil {
        return nil, fmt.Errorf("create order: %w", err)
    }

    // Pass context to external service call
    if err := s.paymentClient.Charge(ctx, order.ID, order.Total); err != nil {
        return nil, fmt.Errorf("charge payment: %w", err)
    }

    return order, nil
}
```

#### 5. Error Handling

Go uses explicit error returns instead of exceptions. Errors are values.

```go
// Define domain errors
var (
    ErrNotFound      = errors.New("not found")
    ErrAlreadyExists = errors.New("already exists")
    ErrInvalidInput  = errors.New("invalid input")
    ErrUnauthorized  = errors.New("unauthorized")
)

// Wrap errors to add context while preserving the original
func (r *OrderRepository) GetByID(ctx context.Context, id string) (*Order, error) {
    var order Order
    err := r.db.QueryRowContext(ctx,
        "SELECT id, user_id, status, total FROM orders WHERE id = $1", id,
    ).Scan(&order.ID, &order.UserID, &order.Status, &order.Total)

    if err == sql.ErrNoRows {
        return nil, fmt.Errorf("order %s: %w", id, ErrNotFound)
    }
    if err != nil {
        return nil, fmt.Errorf("query order %s: %w", id, err)
    }
    return &order, nil
}

// Check wrapped errors with errors.Is
func (h *OrderHandler) GetByID(c *gin.Context) {
    order, err := h.service.GetByID(c.Request.Context(), c.Param("id"))
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
            return
        }
        if errors.Is(err, ErrUnauthorized) {
            c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
            return
        }
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal error"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"data": order})
}
```

#### 6. Interfaces and Dependency Injection

Go interfaces are satisfied implicitly -- a type implements an interface if it has the required methods. This enables clean dependency injection without a framework.

```go
// internal/service/order.go

// Define the interface where it is USED, not where it is implemented
type OrderRepository interface {
    Create(ctx context.Context, order *model.Order) error
    GetByID(ctx context.Context, id string) (*model.Order, error)
    ListByUser(ctx context.Context, userID string, page, limit int) ([]*model.Order, int, error)
    Update(ctx context.Context, order *model.Order) error
}

type PaymentClient interface {
    Charge(ctx context.Context, orderID string, amount int64) error
    Refund(ctx context.Context, orderID string) error
}

type OrderService struct {
    repo    OrderRepository
    payment PaymentClient
}

func NewOrderService(repo OrderRepository, payment PaymentClient) *OrderService {
    return &OrderService{repo: repo, payment: payment}
}

// In tests, provide mock implementations
type mockOrderRepo struct {
    orders map[string]*model.Order
}

func (m *mockOrderRepo) GetByID(ctx context.Context, id string) (*model.Order, error) {
    order, ok := m.orders[id]
    if !ok {
        return nil, ErrNotFound
    }
    return order, nil
}

// Test
func TestGetOrderByID(t *testing.T) {
    repo := &mockOrderRepo{
        orders: map[string]*model.Order{
            "order-1": {ID: "order-1", Status: "confirmed"},
        },
    }
    svc := NewOrderService(repo, &mockPayment{})

    order, err := svc.GetByID(context.Background(), "order-1")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if order.Status != "confirmed" {
        t.Errorf("expected status confirmed, got %s", order.Status)
    }
}
```

### Python Patterns

#### 1. Django ORM

Django's ORM maps Python classes to database tables and provides a powerful query API.

```python
# models.py
from django.db import models
from django.utils import timezone


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        SHIPPED = "shipped", "Shipped"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="orders")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    shipping_address = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"Order {self.id} - {self.status}"

    @property
    def is_cancellable(self):
        return self.status in (self.Status.PENDING, self.Status.CONFIRMED)


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("products.Product", on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    @property
    def subtotal(self):
        return self.quantity * self.unit_price
```

**Common query patterns:**

```python
# Efficient queries with select_related and prefetch_related

# N+1 problem: each order triggers a separate query for user
orders = Order.objects.all()
for order in orders:
    print(order.user.email)  # N additional queries

# Fixed with select_related (JOIN)
orders = Order.objects.select_related("user").all()
for order in orders:
    print(order.user.email)  # No additional queries

# For reverse foreign keys and many-to-many, use prefetch_related
orders = Order.objects.prefetch_related("items", "items__product").all()
for order in orders:
    for item in order.items.all():  # No additional queries
        print(item.product.name)

# Complex filtering
from django.db.models import Q, F, Sum, Count
from django.db.models.functions import TruncMonth

# Orders from the last 30 days, either confirmed or shipped
recent_orders = Order.objects.filter(
    Q(status="confirmed") | Q(status="shipped"),
    created_at__gte=timezone.now() - timedelta(days=30),
)

# Aggregate: total revenue per month
monthly_revenue = (
    Order.objects.filter(status__in=["confirmed", "shipped", "delivered"])
    .annotate(month=TruncMonth("created_at"))
    .values("month")
    .annotate(
        revenue=Sum("total_amount"),
        order_count=Count("id"),
    )
    .order_by("month")
)

# Update without fetching (efficient bulk update)
Order.objects.filter(
    status="pending",
    created_at__lt=timezone.now() - timedelta(hours=24),
).update(status="cancelled")
```

#### 2. Django REST Framework (DRF) Serializers

DRF serializers handle validation, serialization, and deserialization.

```python
# serializers.py
from rest_framework import serializers
from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "quantity", "unit_price", "subtotal"]
        read_only_fields = ["unit_price"]  # Price comes from the product, not from the client


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "user_email", "status", "total_amount",
            "shipping_address", "items", "created_at", "updated_at",
        ]
        read_only_fields = ["status", "total_amount", "created_at", "updated_at"]


class CreateOrderSerializer(serializers.Serializer):
    """Separate serializer for creation with custom validation."""
    shipping_address = serializers.CharField(max_length=500)
    items = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
        max_length=50,
    )

    def validate_items(self, items):
        for item in items:
            if "product_id" not in item or "quantity" not in item:
                raise serializers.ValidationError(
                    "Each item must have product_id and quantity"
                )
            if item["quantity"] < 1 or item["quantity"] > 100:
                raise serializers.ValidationError(
                    "Quantity must be between 1 and 100"
                )
        return items

    def validate_shipping_address(self, value):
        if len(value.strip()) < 10:
            raise serializers.ValidationError(
                "Please provide a complete shipping address"
            )
        return value.strip()

    def create(self, validated_data):
        # Business logic for order creation
        user = self.context["request"].user
        items_data = validated_data.pop("items")

        # Calculate total from current product prices
        total = Decimal("0")
        order_items = []
        for item_data in items_data:
            product = Product.objects.get(id=item_data["product_id"])
            subtotal = product.price * item_data["quantity"]
            total += subtotal
            order_items.append(
                OrderItem(
                    product=product,
                    quantity=item_data["quantity"],
                    unit_price=product.price,
                )
            )

        order = Order.objects.create(
            user=user,
            total_amount=total,
            **validated_data,
        )

        for item in order_items:
            item.order = order
        OrderItem.objects.bulk_create(order_items)

        return order
```

#### 3. Django Middleware

Middleware processes requests and responses globally, forming a pipeline.

```python
# middleware.py
import time
import uuid
import logging
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)


class RequestIDMiddleware(MiddlewareMixin):
    """Attach a unique request ID to every request."""

    def process_request(self, request):
        request.request_id = request.META.get(
            "HTTP_X_REQUEST_ID",
            str(uuid.uuid4()),
        )

    def process_response(self, request, response):
        request_id = getattr(request, "request_id", "unknown")
        response["X-Request-ID"] = request_id
        return response


class RequestLoggingMiddleware(MiddlewareMixin):
    """Log request details and duration."""

    def process_request(self, request):
        request._start_time = time.monotonic()

    def process_response(self, request, response):
        duration_ms = (time.monotonic() - getattr(request, "_start_time", 0)) * 1000
        logger.info(
            "Request completed",
            extra={
                "request_id": getattr(request, "request_id", "unknown"),
                "method": request.method,
                "path": request.path,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 2),
                "user_id": request.user.id if request.user.is_authenticated else None,
            },
        )
        return response


class SecurityHeadersMiddleware(MiddlewareMixin):
    """Add security headers to every response."""

    def process_response(self, request, response):
        response["X-Content-Type-Options"] = "nosniff"
        response["X-Frame-Options"] = "DENY"
        response["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response
```

#### 4. Django Signals

Signals allow decoupled components to react to events within the Django framework.

```python
# signals.py
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.core.mail import send_mail
from .models import Order


@receiver(pre_save, sender=Order)
def validate_order_transition(sender, instance, **kwargs):
    """Validate that order status transitions are legal."""
    if instance.pk is None:
        return  # New order, no transition to validate

    try:
        old_order = Order.objects.get(pk=instance.pk)
    except Order.DoesNotExist:
        return

    valid_transitions = {
        "pending": {"confirmed", "cancelled"},
        "confirmed": {"shipped", "cancelled"},
        "shipped": {"delivered"},
        "delivered": set(),
        "cancelled": set(),
    }

    if instance.status != old_order.status:
        allowed = valid_transitions.get(old_order.status, set())
        if instance.status not in allowed:
            raise ValueError(
                f"Invalid transition: {old_order.status} -> {instance.status}"
            )


@receiver(post_save, sender=Order)
def notify_order_status_change(sender, instance, created, **kwargs):
    """Send notification when order status changes."""
    if created:
        # New order: send confirmation
        send_order_notification.delay(instance.id, "order_created")
    else:
        # Status update: send status change notification
        send_order_notification.delay(instance.id, "status_changed")
```

#### 5. Celery Tasks

Celery handles asynchronous background tasks, periodic jobs, and distributed work.

```python
# tasks.py
from celery import shared_task
from celery.utils.log import get_task_logger
from django.core.mail import send_mail
from django.template.loader import render_to_string

logger = get_task_logger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,  # 1 minute between retries
    autoretry_for=(ConnectionError, TimeoutError),
    retry_backoff=True,       # Exponential backoff
    retry_backoff_max=600,    # Max 10 minutes between retries
    acks_late=True,           # Acknowledge after completion (at-least-once)
)
def send_order_notification(self, order_id: int, event_type: str):
    """Send order notification email."""
    try:
        order = Order.objects.select_related("user").get(id=order_id)
    except Order.DoesNotExist:
        logger.warning(f"Order {order_id} not found, skipping notification")
        return

    templates = {
        "order_created": "emails/order_created.html",
        "status_changed": "emails/order_status_changed.html",
    }

    template = templates.get(event_type)
    if not template:
        logger.error(f"Unknown event type: {event_type}")
        return

    html_content = render_to_string(template, {"order": order})

    send_mail(
        subject=f"Order #{order.id} - {event_type.replace('_', ' ').title()}",
        message="",
        html_message=html_content,
        from_email="orders@example.com",
        recipient_list=[order.user.email],
    )

    logger.info(f"Sent {event_type} notification for order {order_id}")


@shared_task
def generate_daily_report():
    """Periodic task: generate daily sales report."""
    from django.db.models import Sum, Count
    from django.utils import timezone
    from datetime import timedelta

    yesterday = timezone.now().date() - timedelta(days=1)

    stats = Order.objects.filter(
        created_at__date=yesterday,
        status__in=["confirmed", "shipped", "delivered"],
    ).aggregate(
        total_revenue=Sum("total_amount"),
        order_count=Count("id"),
    )

    logger.info(
        f"Daily report for {yesterday}: "
        f"revenue={stats['total_revenue']}, "
        f"orders={stats['order_count']}"
    )

    return stats


# Celery Beat schedule (in settings.py or celery config)
# CELERY_BEAT_SCHEDULE = {
#     "daily-report": {
#         "task": "orders.tasks.generate_daily_report",
#         "schedule": crontab(hour=1, minute=0),  # Run at 1:00 AM
#     },
# }
```

#### 6. Type Hints

Modern Python uses type hints for better documentation, IDE support, and static analysis.

```python
# services.py
from __future__ import annotations
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol


# Protocol: structural typing (like Go interfaces)
class PaymentGateway(Protocol):
    def charge(self, amount: Decimal, currency: str, token: str) -> PaymentResult: ...
    def refund(self, payment_id: str) -> RefundResult: ...


@dataclass(frozen=True)  # frozen=True makes it immutable
class PaymentResult:
    payment_id: str
    status: str
    amount: Decimal
    currency: str


@dataclass(frozen=True)
class RefundResult:
    refund_id: str
    status: str
    amount: Decimal


class OrderService:
    def __init__(
        self,
        order_repo: OrderRepository,
        payment_gateway: PaymentGateway,
        notification_service: NotificationService,
    ) -> None:
        self._order_repo = order_repo
        self._payment_gateway = payment_gateway
        self._notifications = notification_service

    def create_order(
        self,
        user_id: int,
        items: list[OrderItemInput],
        shipping_address: str,
    ) -> Order:
        # Calculate total
        total = sum(item.unit_price * item.quantity for item in items)

        # Process payment
        payment = self._payment_gateway.charge(
            amount=total,
            currency="USD",
            token=items[0].payment_token,
        )

        if payment.status != "succeeded":
            raise PaymentError(f"Payment failed: {payment.status}")

        # Create order
        order = self._order_repo.create(
            user_id=user_id,
            total_amount=total,
            shipping_address=shipping_address,
            payment_id=payment.payment_id,
            items=items,
        )

        # Send notification (async via Celery)
        self._notifications.send_order_confirmation(order.id)

        return order
```

---

## Practical Scenarios

### Scenario 1: Building a High-Throughput API in Go

**Context:** Build a service that handles 10,000 requests/second for product search.

**Go is the right choice because:**
- Built-in concurrency (goroutines) handles thousands of concurrent connections efficiently
- Low memory footprint per connection compared to thread-per-request models
- Compiled binary with no runtime startup cost
- Predictable latency (no garbage collection pauses like JVM stop-the-world)

**Key patterns used:**

```go
// Connection pooling for external services
var httpClient = &http.Client{
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 100,
        IdleConnTimeout:     90 * time.Second,
    },
    Timeout: 5 * time.Second,
}

// Database connection pool
db, _ := sql.Open("postgres", connStr)
db.SetMaxOpenConns(50)
db.SetMaxIdleConns(25)
db.SetConnMaxLifetime(5 * time.Minute)
```

### Scenario 2: Building an Admin Dashboard Backend in Python/Django

**Context:** Internal admin tool for managing orders, users, and reports.

**Python/Django is the right choice because:**
- Django Admin provides an out-of-the-box admin interface
- Rapid development: ORM, migrations, auth, serializers are all built in
- Complex reporting queries are easier to express with the Django ORM
- Performance is adequate (internal tool, not high-traffic)
- Rich ecosystem for data processing and visualization

### Scenario 3: Choosing Between Go and Python for a New Microservice

**Decision framework:**

| Factor | Choose Go | Choose Python |
|--------|-----------|---------------|
| Concurrency needs | High (thousands of goroutines) | Moderate (async/await or Celery) |
| Latency sensitivity | Sub-millisecond matters | Tens of milliseconds acceptable |
| Team expertise | Team knows Go | Team knows Python |
| Data processing | Not the primary concern | Heavy data wrangling, ML |
| Deployment size | Minimal container image (~10MB) | Larger image (~200MB+) |
| Development speed | Moderate (more boilerplate) | Fast (less boilerplate, rich stdlib) |
| Type safety | Compile-time guarantees | Runtime checks (even with type hints) |
| Library ecosystem | Growing, strong in infra | Massive, strong in data/ML/web |

---

## Interview Questions

### Question 1: How does Go handle concurrency differently from Python?

**Answer:**

Go uses goroutines -- lightweight, user-space threads managed by the Go runtime scheduler. You can spawn millions of goroutines; each starts with only ~2KB of stack space that grows as needed. Goroutines communicate via channels, which provide safe, synchronized data transfer. The runtime multiplexes goroutines onto OS threads (M:N threading model).

Python's concurrency model is constrained by the Global Interpreter Lock (GIL) in CPython. The GIL allows only one thread to execute Python bytecode at a time, making CPU-bound threading ineffective. Python offers several workarounds:

- **asyncio:** Event-loop-based concurrency for I/O-bound tasks. Single-threaded, cooperative multitasking.
- **threading:** Useful for I/O-bound tasks (the GIL is released during I/O operations), but not for CPU-bound work.
- **multiprocessing:** Spawns separate processes to bypass the GIL. Higher overhead (memory, IPC), but true parallelism.
- **Celery:** Distributed task queue for background processing across workers.

In practice, Go is naturally suited for high-concurrency network services. Python requires more architectural decisions about which concurrency model to use and is generally chosen when concurrency is not the primary concern.

### Question 2: Explain Go's error handling philosophy and compare it to Python's exceptions.

**Answer:**

Go treats errors as values. Functions that can fail return an `error` as the last return value. The caller must explicitly check and handle it. There is no exception mechanism -- `panic` exists but is reserved for truly unrecoverable situations (programming bugs, not expected failures).

```go
result, err := doSomething()
if err != nil {
    return fmt.Errorf("context: %w", err)
}
```

**Advantages of Go's approach:**
- Errors are visible in the function signature
- Cannot forget to handle them (compiler warns about unused variables)
- Control flow is explicit -- no hidden jump paths from exceptions
- Error wrapping with `%w` creates an error chain that preserves context

**Disadvantages:**
- Verbose (the `if err != nil` pattern is repetitive)
- No stack traces by default (must use third-party libraries or `runtime.Stack()`)

Python uses exceptions, which propagate up the call stack until caught by a `try/except` block. Exceptions can carry rich information (stack traces, exception chaining).

**Advantages of Python's approach:**
- Less boilerplate at the call site
- Automatic stack traces
- Can catch exceptions at any level in the call stack

**Disadvantages:**
- Exceptions are invisible in function signatures (no checked exceptions in Python)
- Easy to forget to handle them -- they silently propagate
- Can make control flow hard to follow when exceptions are used for flow control

### Question 3: When would you use Django signals vs Celery tasks?

**Answer:**

**Django signals** are for synchronous, in-process reactions to model events. Use them when:
- The reaction must happen immediately (e.g., validating a state transition before save)
- The reaction is fast and reliable (updating a related model, invalidating a cache)
- The reaction is tightly coupled to the model lifecycle (pre_save, post_save, post_delete)

**Celery tasks** are for asynchronous, potentially long-running, or unreliable operations. Use them when:
- The operation should not block the request/response cycle (sending emails, generating reports)
- The operation might fail and needs retries (external API calls, payment processing)
- The operation is resource-intensive (image processing, data aggregation)
- The operation can be delayed without affecting user experience

A common pattern is to combine them: a signal triggers a Celery task. For example, a `post_save` signal on the Order model dispatches a Celery task to send a confirmation email. The signal fires synchronously (fast), and the actual email sending happens asynchronously (potentially slow, retryable).

### Question 4: How do you structure a Go project for maintainability?

**Answer:**

I follow these principles:

1. **`cmd/` for entry points, `internal/` for private code.** The `internal` directory is enforced by the Go compiler -- nothing outside the module can import it.

2. **Layer by responsibility:** handlers (HTTP), services (business logic), repositories (data access). Each layer depends only on the layer below it.

3. **Define interfaces where they are consumed, not where they are implemented.** The `service` package defines a `Repository` interface. The `repository` package implements it. This follows Go's convention of small, focused interfaces.

4. **Keep packages cohesive.** A package should represent a single concept. Avoid "utils" packages -- they become dumping grounds. Instead, name packages for what they provide: `pagination`, `auth`, `validation`.

5. **Constructor functions for dependency injection.** `NewOrderService(repo, payment)` makes dependencies explicit without a DI framework.

6. **Accept interfaces, return structs.** Functions should accept interface parameters (for flexibility) and return concrete types (for clarity).

### Question 5: How do you optimize Django ORM queries?

**Answer:**

The most common performance issues with Django ORM and how to fix them:

1. **N+1 queries:** Use `select_related()` for foreign key relationships (SQL JOIN) and `prefetch_related()` for reverse relations and many-to-many (separate query + Python-side join).

2. **Fetching too many fields:** Use `values()` or `values_list()` when you only need specific fields. Use `defer()` to exclude large columns (like text blobs) from the initial query.

3. **Count queries:** Use `exists()` instead of `count()` when you only need to know if results exist (not how many).

4. **Bulk operations:** Use `bulk_create()` and `bulk_update()` instead of looping with `save()`. Each `save()` is a separate query.

5. **Raw SQL for complex queries:** When the ORM generates inefficient SQL, drop down to `raw()` or `connection.cursor()` for specific queries. This is not a failure -- it is pragmatic.

6. **Django Debug Toolbar:** In development, use this to see exactly how many queries each view executes and how long they take.

```python
# Before: N+1 (1 query for orders + N queries for users)
orders = Order.objects.all()
for order in orders:
    print(order.user.email)

# After: 1 query with JOIN
orders = Order.objects.select_related("user").all()

# Before: Loading entire objects for a list view
orders = Order.objects.all()

# After: Only fetch needed fields
orders = Order.objects.values("id", "status", "total_amount", "created_at")
```

### Question 6: Compare Go interfaces with Python Protocols.

**Answer:**

Both Go interfaces and Python Protocols use structural typing (duck typing) -- a type satisfies the interface if it has the required methods, without explicitly declaring that it implements the interface.

**Go interfaces:**
```go
type Writer interface {
    Write(p []byte) (n int, err error)
}
// Any type with a Write method satisfies Writer
```

**Python Protocols:**
```python
from typing import Protocol

class Writer(Protocol):
    def write(self, data: bytes) -> int: ...
# Any class with a write method satisfies Writer
```

**Key differences:**

- Go interfaces are checked at compile time. If you pass a type that does not satisfy the interface, you get a compile error. Python Protocols are checked by static type checkers (mypy, pyright) but not at runtime.
- Go interfaces are a first-class language feature. Python Protocols are a typing construct added in Python 3.8.
- Go encourages small interfaces (1-3 methods). The standard library has `io.Reader` (1 method), `io.Writer` (1 method), and `io.ReadWriter` (composition of both).
- In Go, interfaces are typically defined by the consumer. In Python, Protocols can be defined anywhere but are often defined alongside the code that uses them.

---

## Code Examples

### Example 1: Go Middleware Chain

```go
// internal/middleware/auth.go
package middleware

import (
    "net/http"
    "strings"
    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"
)

func Auth(secret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "error": "Authorization header required",
            })
            return
        }

        tokenString := strings.TrimPrefix(authHeader, "Bearer ")
        claims := &jwt.RegisteredClaims{}

        token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
            return []byte(secret), nil
        })

        if err != nil || !token.Valid {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
                "error": "Invalid token",
            })
            return
        }

        c.Set("userID", claims.Subject)
        c.Next()
    }
}

// internal/middleware/ratelimit.go
func RateLimit(rps int) gin.HandlerFunc {
    limiter := rate.NewLimiter(rate.Limit(rps), rps)

    return func(c *gin.Context) {
        if !limiter.Allow() {
            c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
                "error": "Rate limit exceeded",
            })
            return
        }
        c.Next()
    }
}

// internal/middleware/requestid.go
func RequestID() gin.HandlerFunc {
    return func(c *gin.Context) {
        requestID := c.GetHeader("X-Request-ID")
        if requestID == "" {
            requestID = uuid.New().String()
        }
        c.Set("requestID", requestID)
        c.Header("X-Request-ID", requestID)
        c.Next()
    }
}
```

### Example 2: Django DRF ViewSet with Filters

```python
# views.py
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Order
from .serializers import OrderSerializer, CreateOrderSerializer
from .filters import OrderFilter


class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = OrderSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_class = OrderFilter
    ordering_fields = ["created_at", "total_amount"]
    ordering = ["-created_at"]
    search_fields = ["id", "shipping_address"]

    def get_queryset(self):
        return (
            Order.objects
            .filter(user=self.request.user)
            .select_related("user")
            .prefetch_related("items", "items__product")
        )

    def get_serializer_class(self):
        if self.action == "create":
            return CreateOrderSerializer
        return OrderSerializer

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if not order.is_cancellable:
            return Response(
                {"error": f"Order in status '{order.status}' cannot be cancelled"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = Order.Status.CANCELLED
        order.save(update_fields=["status", "updated_at"])
        return Response(OrderSerializer(order).data)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        from django.db.models import Sum, Count, Avg

        stats = self.get_queryset().aggregate(
            total_orders=Count("id"),
            total_spent=Sum("total_amount"),
            avg_order_value=Avg("total_amount"),
        )
        return Response(stats)


# filters.py
import django_filters
from .models import Order


class OrderFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=Order.Status.choices)
    min_amount = django_filters.NumberFilter(field_name="total_amount", lookup_expr="gte")
    max_amount = django_filters.NumberFilter(field_name="total_amount", lookup_expr="lte")
    created_after = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_before = django_filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")

    class Meta:
        model = Order
        fields = ["status", "min_amount", "max_amount", "created_after", "created_before"]
```

### Example 3: Go Database Repository with Transactions

```go
// internal/repository/order.go
package repository

import (
    "context"
    "database/sql"
    "fmt"
    "myservice/internal/model"
)

type OrderRepository struct {
    db *sql.DB
}

func NewOrderRepository(db *sql.DB) *OrderRepository {
    return &OrderRepository{db: db}
}

func (r *OrderRepository) CreateWithItems(
    ctx context.Context,
    order *model.Order,
    items []model.OrderItem,
) error {
    tx, err := r.db.BeginTx(ctx, nil)
    if err != nil {
        return fmt.Errorf("begin transaction: %w", err)
    }
    defer tx.Rollback() // No-op if committed

    // Insert order
    err = tx.QueryRowContext(ctx,
        `INSERT INTO orders (user_id, status, total_amount, shipping_address)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        order.UserID, order.Status, order.TotalAmount, order.ShippingAddress,
    ).Scan(&order.ID, &order.CreatedAt)
    if err != nil {
        return fmt.Errorf("insert order: %w", err)
    }

    // Batch insert items
    stmt, err := tx.PrepareContext(ctx,
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
    )
    if err != nil {
        return fmt.Errorf("prepare item insert: %w", err)
    }
    defer stmt.Close()

    for _, item := range items {
        _, err := stmt.ExecContext(ctx, order.ID, item.ProductID, item.Quantity, item.UnitPrice)
        if err != nil {
            return fmt.Errorf("insert item for product %s: %w", item.ProductID, err)
        }
    }

    if err := tx.Commit(); err != nil {
        return fmt.Errorf("commit transaction: %w", err)
    }

    return nil
}

func (r *OrderRepository) GetByID(ctx context.Context, id string) (*model.Order, error) {
    var order model.Order
    err := r.db.QueryRowContext(ctx,
        `SELECT id, user_id, status, total_amount, shipping_address, created_at, updated_at
         FROM orders WHERE id = $1`,
        id,
    ).Scan(
        &order.ID, &order.UserID, &order.Status,
        &order.TotalAmount, &order.ShippingAddress,
        &order.CreatedAt, &order.UpdatedAt,
    )
    if err == sql.ErrNoRows {
        return nil, fmt.Errorf("order %s: %w", id, ErrNotFound)
    }
    if err != nil {
        return nil, fmt.Errorf("query order: %w", err)
    }

    // Fetch items
    rows, err := r.db.QueryContext(ctx,
        `SELECT id, product_id, quantity, unit_price
         FROM order_items WHERE order_id = $1`,
        id,
    )
    if err != nil {
        return nil, fmt.Errorf("query items: %w", err)
    }
    defer rows.Close()

    for rows.Next() {
        var item model.OrderItem
        if err := rows.Scan(&item.ID, &item.ProductID, &item.Quantity, &item.UnitPrice); err != nil {
            return nil, fmt.Errorf("scan item: %w", err)
        }
        order.Items = append(order.Items, item)
    }

    return &order, rows.Err()
}
```

### Example 4: Python Service with Dependency Injection

```python
# services/order_service.py
from __future__ import annotations
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol


class OrderRepository(Protocol):
    def create(self, user_id: int, total: Decimal, address: str, items: list) -> Order: ...
    def get_by_id(self, order_id: int) -> Order | None: ...
    def update_status(self, order_id: int, status: str) -> Order: ...


class InventoryService(Protocol):
    def check_availability(self, items: list[dict]) -> bool: ...
    def reserve(self, items: list[dict]) -> str: ...
    def release(self, reservation_id: str) -> None: ...


class PaymentGateway(Protocol):
    def charge(self, amount: Decimal, token: str) -> PaymentResult: ...


@dataclass(frozen=True)
class CreateOrderInput:
    items: list[dict]
    shipping_address: str
    payment_token: str


class OrderService:
    def __init__(
        self,
        order_repo: OrderRepository,
        inventory: InventoryService,
        payment: PaymentGateway,
    ) -> None:
        self._orders = order_repo
        self._inventory = inventory
        self._payment = payment

    def create_order(self, user_id: int, input_data: CreateOrderInput) -> Order:
        # Check inventory
        if not self._inventory.check_availability(input_data.items):
            raise InsufficientInventoryError("Some items are out of stock")

        # Reserve inventory
        reservation_id = self._inventory.reserve(input_data.items)

        try:
            # Calculate total
            total = sum(
                Decimal(str(item["price"])) * item["quantity"]
                for item in input_data.items
            )

            # Process payment
            payment = self._payment.charge(total, input_data.payment_token)
            if payment.status != "succeeded":
                raise PaymentError(f"Payment failed: {payment.status}")

            # Create order
            order = self._orders.create(
                user_id=user_id,
                total=total,
                address=input_data.shipping_address,
                items=input_data.items,
            )

            return order

        except Exception:
            # Release inventory if anything fails after reservation
            self._inventory.release(reservation_id)
            raise


# Testing with mocks (no framework needed, thanks to Protocols)
class FakeOrderRepo:
    def __init__(self):
        self.orders = {}
        self._next_id = 1

    def create(self, user_id, total, address, items):
        order = Order(id=self._next_id, user_id=user_id, total=total)
        self.orders[self._next_id] = order
        self._next_id += 1
        return order

    def get_by_id(self, order_id):
        return self.orders.get(order_id)


def test_create_order():
    repo = FakeOrderRepo()
    inventory = FakeInventory(available=True)
    payment = FakePayment(status="succeeded")

    service = OrderService(repo, inventory, payment)
    order = service.create_order(
        user_id=1,
        input_data=CreateOrderInput(
            items=[{"product_id": 1, "quantity": 2, "price": "29.99"}],
            shipping_address="123 Main St",
            payment_token="tok_test",
        ),
    )
    assert order.id == 1
```

---

## Quick Reference

### Go vs Python at a Glance

| Aspect | Go | Python |
|--------|-----|--------|
| **Type system** | Static, compiled | Dynamic, interpreted |
| **Concurrency** | Goroutines + channels | asyncio, threading, multiprocessing |
| **Error handling** | Explicit error returns | Exceptions |
| **Package management** | Go modules | pip, Poetry, uv |
| **Web frameworks** | Gin, Echo, Fiber, Chi | Django, FastAPI, Flask |
| **ORM** | GORM, sqlx, Ent | Django ORM, SQLAlchemy |
| **Testing** | Built-in `testing` package | pytest, unittest |
| **Deployment** | Single static binary | Container with runtime |
| **Memory footprint** | Low (~10-50MB typical) | Higher (~100-500MB typical) |
| **Build time** | Seconds | N/A (interpreted) |
| **Learning curve** | Small language, few concepts | Easy to start, deep ecosystem |

### Go Error Handling Cheat Sheet

```go
// Return errors
func doWork() (Result, error) { ... }

// Check errors
result, err := doWork()
if err != nil {
    return fmt.Errorf("doWork failed: %w", err)  // Wrap with context
}

// Define sentinel errors
var ErrNotFound = errors.New("not found")

// Check error type
if errors.Is(err, ErrNotFound) { ... }

// Check error interface
var validErr *ValidationError
if errors.As(err, &validErr) { ... }
```

### Django ORM Cheat Sheet

```python
# Basic CRUD
obj = Model.objects.create(field="value")
obj = Model.objects.get(id=1)
qs = Model.objects.filter(status="active")
Model.objects.filter(id=1).update(status="done")
Model.objects.filter(id=1).delete()

# Avoid N+1
.select_related("fk_field")       # JOIN (ForeignKey, OneToOne)
.prefetch_related("reverse_set")  # Separate query (reverse FK, M2M)

# Aggregation
from django.db.models import Count, Sum, Avg, F, Q
qs.aggregate(total=Sum("amount"))
qs.annotate(item_count=Count("items"))

# Efficient updates
qs.update(status="new_status")    # Single UPDATE query
Model.objects.bulk_create([...])  # Single INSERT query
Model.objects.bulk_update([...])  # Single UPDATE query
```

### When to Choose Which

```
Choose Go when:
  - High concurrency / high throughput is critical
  - Low latency is required (< 10ms P99)
  - Deploying as a minimal container (static binary)
  - Building infrastructure tooling (CLI, proxy, agent)
  - The service is long-running and memory efficiency matters

Choose Python when:
  - Rapid development is the priority
  - Heavy data processing, ML, or analytics
  - Rich admin interface needed (Django Admin)
  - Team is primarily Python-experienced
  - Prototyping / MVP where iteration speed matters
  - Integration with data science ecosystem (pandas, numpy, sklearn)

Choose both when:
  - Performance-critical services in Go, business logic services in Python
  - Go for the API gateway / proxy layer, Python for the application layer
  - Go for real-time features, Python for batch processing
```

### Key Takeaways

1. **Go's strengths are performance, concurrency, and operational simplicity** (single binary, low memory).
2. **Python's strengths are development speed, ecosystem richness, and expressiveness.**
3. **Go's error handling is verbose but explicit.** You always know where errors are handled.
4. **Django's ORM is powerful but requires attention** to avoid N+1 queries. Use `select_related` and `prefetch_related`.
5. **Celery is essential for Python async work.** Use it for anything that should not block the request cycle.
6. **Go interfaces and Python Protocols serve the same purpose** -- structural typing for dependency injection and testability.
7. **Project structure matters.** Both languages have community conventions. Follow them.
8. **Choose based on team and problem, not hype.** The best language is the one your team can ship and maintain.
