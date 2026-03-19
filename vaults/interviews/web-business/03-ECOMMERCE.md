# E-Commerce & Online Shopping

## What Is It?

E-commerce is selling products or services online. As a developer, you're building the digital storefront — the product catalog, shopping cart, checkout process, order management, and everything that connects the customer's click to an actual delivery. Whether it's Amazon-scale retail or a small Shopify store, the fundamental business flows are the same.

## Why Should You Care?

E-commerce is one of the most common types of web applications you'll build. Even if your company isn't a retailer, chances are you'll encounter e-commerce patterns: product listings, cart logic, order state machines, inventory tracking, pricing rules. Understanding the business flow saves you from building things that work in code but fail in the real world — like a checkout that doesn't handle out-of-stock items, or a cart that forgets about shipping costs.

## How It Works (The Business Flow)

### Product Catalog

1. **Product Creation**: Admin adds products with name, description, images, price, SKU
2. **Variants**: A t-shirt comes in S/M/L and red/blue → 6 variants, each with its own SKU and stock level
3. **Categories & Tags**: Products are organized into categories (Electronics > Phones) and tagged for search
4. **Pricing**: Base price, sale price, bulk pricing, member pricing — prices can be surprisingly complex
5. **Visibility**: Products can be draft, active, or archived. Only active products show on the storefront

### Shopping Cart

1. User clicks "Add to Cart" → item is added to their cart (stored in session, cookie, or database)
2. Cart shows items, quantities, subtotal
3. User can update quantities or remove items
4. Cart recalculates on every change: subtotal + tax + shipping - discounts = total
5. For logged-in users, the cart usually persists across devices

### Checkout

1. **Shipping Address**: User enters where to ship
2. **Shipping Method**: Options with different costs and delivery times (standard, express, overnight)
3. **Tax Calculation**: Calculated based on shipping destination and product type
4. **Discount/Promo Code**: Applied before payment. Validation happens server-side
5. **Payment**: See the [Payment Processing](02-PAYMENT.md) article
6. **Order Confirmation**: System creates an order record, sends confirmation email, clears the cart

### Order Lifecycle

This is a state machine — one of the most important concepts in e-commerce:

```
Created → Paid → Processing → Shipped → Delivered
                                    ↘ Returned → Refunded
           ↘ Payment Failed → Cancelled
```

- **Created**: Order placed, awaiting payment
- **Paid**: Payment confirmed
- **Processing**: Warehouse is picking and packing
- **Shipped**: Handed to carrier, tracking number issued
- **Delivered**: Carrier confirms delivery
- **Returned**: Customer initiated a return
- **Refunded**: Money sent back to customer
- **Cancelled**: Order was cancelled (by customer or system)

### Inventory Management

1. Each product/variant has a stock count
2. When an order is placed, stock is **reserved** (decremented or held)
3. When the order ships, the reservation becomes a deduction
4. If the order is cancelled, stock is released back
5. Low stock triggers alerts. Zero stock shows "Out of Stock" on the storefront

### Returns & Refunds

1. Customer requests a return (within the return window, usually 14-30 days)
2. System generates a return authorization (RMA number)
3. Customer ships the item back
4. Warehouse inspects the returned item
5. Refund is issued (full or partial, depending on condition)
6. Inventory is updated (item goes back in stock or is written off)

## Key Terms You'll Hear

| Term                    | What It Means                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| **SKU**                 | Stock Keeping Unit — a unique identifier for each product variant                           |
| **Cart Abandonment**    | User adds items to cart but never completes checkout. Happens ~70% of the time              |
| **Conversion Rate**     | Percentage of visitors who complete a purchase. Typically 2-3%                              |
| **AOV**                 | Average Order Value — the average amount spent per order                                    |
| **GMV**                 | Gross Merchandise Value — total value of goods sold through your platform                   |
| **Fulfillment**         | The process of picking, packing, and shipping orders                                        |
| **3PL**                 | Third-Party Logistics — companies like ShipBob that handle warehousing and shipping for you |
| **Dropshipping**        | Selling products you don't stock. Supplier ships directly to customer                       |
| **RMA**                 | Return Merchandise Authorization — a ticket number for returns                              |
| **Promo Code / Coupon** | A code that gives discounts (percentage off, fixed amount off, free shipping)               |
| **Cross-sell**          | "Customers also bought..." — suggesting related products                                    |
| **Upsell**              | "Upgrade to the Pro version" — suggesting a higher-priced alternative                       |
| **Backorder**           | Customer buys an out-of-stock item with the promise it will ship when restocked             |

## Common Patterns

### Pattern 1: Monolithic E-Commerce Platform

One application handles everything — catalog, cart, checkout, orders, admin. Think Shopify, WooCommerce.

**When it's used:** Small to medium businesses. Quick to launch.

**Trade-off:** Hard to customize, harder to scale individual components.

### Pattern 2: Headless Commerce

The backend (catalog, cart, checkout API) is decoupled from the frontend. You build a custom storefront that calls commerce APIs.

**When it's used:** Brands that want unique customer experiences. Often paired with a CMS.

**Trade-off:** More development effort, but total control over the frontend.

### Pattern 3: Marketplace

Multiple sellers list products on one platform (Amazon, Etsy, eBay). The platform handles checkout and distributes payments.

**When it's used:** Platform businesses that connect buyers and sellers.

**Trade-off:** Much more complex: multi-seller cart, split payments, seller onboarding, dispute resolution.

## Gotchas & Edge Cases

- **Race conditions on inventory**: Two people buy the last item at the same time. You need atomic stock decrements or a reservation system.
- **Price changes mid-cart**: User adds an item, price changes before checkout. Do you honor the old price? Most sites lock the price at cart-add time.
- **International shipping**: Different countries have different import duties, taxes, and restricted items. This gets complicated fast.
- **Cart persistence**: Guest users lose their cart if they clear cookies. Merging a guest cart with a logged-in user's cart is a common tricky feature.
- **Discount stacking**: Can users apply multiple promo codes? Can a promo code be combined with a sale price? Define clear rules upfront.
- **Tax nexus**: In the US, you only collect sales tax in states where you have "nexus" (physical or economic presence). This changes as your business grows.
- **Fraud detection**: Watch for unusual patterns — bulk orders to new addresses, many failed payment attempts, mismatched billing/shipping addresses.
- **Soft deletes**: Never hard-delete products that have been ordered. Orders reference products — deleting breaks the reference. Archive instead.

## Quick Reference

| Component        | Key Consideration                              |
| ---------------- | ---------------------------------------------- |
| Product catalog  | Variants, pricing tiers, visibility states     |
| Shopping cart    | Persistence, recalculation, guest vs logged-in |
| Checkout         | Tax, shipping, promo codes, payment            |
| Order management | State machine with clear transitions           |
| Inventory        | Atomic updates, reservations, low-stock alerts |
| Returns          | RMA flow, refund types, restocking             |
| Search           | Full-text, faceted filters, relevance ranking  |
| Admin panel      | Product CRUD, order management, analytics      |
