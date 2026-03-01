# Food Delivery & On-Demand Services

## What Is It?

A food delivery platform connects three parties: customers who want meals, restaurants that prepare them, and drivers who transport them. Unlike traditional e-commerce where you have hours or days to fulfill an order, food delivery operates on a 30-to-45-minute clock. The food is perishable, the customer is hungry, and every minute of delay degrades the product. You're building a real-time logistics system that coordinates menu availability, order preparation, driver routing, and payment — all under extreme time pressure and with three distinct user experiences to maintain simultaneously.

## Why Should You Care?

Food delivery is one of the most complex consumer applications you can build. It combines marketplace dynamics (two-sided supply and demand), real-time logistics (GPS tracking, dispatch algorithms), dynamic pricing (surge during peak hours), payments (splitting money between platform, restaurant, and driver), and operational complexity (handling a product that literally gets worse with every passing minute). If you've worked on e-commerce, imagine the same problems but where every order has a countdown timer. The patterns you learn here — dispatch matching, real-time state machines, geofencing, ETA estimation — apply directly to ride-hailing, grocery delivery, and any on-demand service.

## How It Works (The Business Flow)

### Restaurant Onboarding

Before a restaurant appears on the platform, it goes through onboarding:

1. **Application**: Restaurant submits business details — name, address, cuisine type, operating hours, business license, food safety certification
2. **Verification**: Platform verifies the business license, inspects food safety documents, and may conduct an in-person visit
3. **Menu Digitization**: The restaurant's menu gets entered into the system. This is often done by an onboarding team using photos of the physical menu, or via a self-serve portal. Each item needs a name, description, price, photo, category, preparation time estimate, and modifier options (size, toppings, spice level)
4. **Integration Setup**: For high-volume restaurants, the platform may integrate directly with the restaurant's POS system so orders flow automatically. Smaller restaurants get a tablet with the platform's restaurant app
5. **Commission Agreement**: The platform and restaurant agree on a commission rate (typically 15-30% per order) and payout terms
6. **Trial Period**: New restaurants may run with limited visibility or a probation period to ensure quality

### Menu Management and Availability

Menus in food delivery are not static. They change constantly:

- **Dayparting**: Different menus for breakfast, lunch, and dinner. A restaurant might serve eggs at 8 AM and burgers at noon
- **Item availability**: The kitchen runs out of an ingredient, so specific items must be marked unavailable in real-time. The restaurant app or tablet lets staff toggle items on and off instantly
- **Modifiers and customization**: Each item can have required modifiers (choose your size) and optional modifiers (add bacon, extra cheese). These affect pricing and preparation time
- **Special menus**: Holiday menus, weekend-only items, limited-time promotions
- **Photos and descriptions**: High-quality food photos significantly increase order rates. Some platforms provide professional photography as part of onboarding

The menu data model is deceptively complex: items belong to categories, have multiple modifier groups, each modifier has its own price delta, and availability can vary by time of day and day of week.

### Order Placement and Validation

When a customer places an order:

1. **Cart validation**: Before checkout, verify every item is still available, the restaurant is still open, and the delivery address is within the restaurant's delivery zone
2. **Price calculation**: Sum item prices, apply modifier price deltas, calculate subtotal, apply promotions or coupons, add delivery fee, add service fee, calculate tax, and compute the final total
3. **Payment authorization**: Place a hold on the customer's payment method for the estimated total (final amount may change if the restaurant modifies the order)
4. **Order creation**: Create the order record with status `placed` and notify the restaurant
5. **Restaurant acceptance**: The restaurant sees the order on their tablet and has a short window (60-90 seconds) to accept or reject it. If they reject it (too busy, item unavailable), the customer is notified and the payment hold is released

### Driver/Rider Dispatch and Matching

Dispatch is the core algorithmic challenge. When a restaurant accepts an order, the system needs to assign a driver:

- **Proximity matching**: Find available drivers near the restaurant, not near the customer. The driver needs to arrive at the restaurant when the food is ready
- **Batching**: If two orders are going to the same area from the same restaurant (or nearby restaurants), assign both to one driver. This improves economics but increases delivery time for one of the orders
- **ETA-aware dispatch**: Don't dispatch a driver immediately if the food takes 20 minutes to prepare. Time the dispatch so the driver arrives just as the food is ready — minimizing driver idle time at the restaurant
- **Driver scoring**: Consider the driver's acceptance rate, ratings, vehicle type (bicycle vs. car), and current workload
- **Broadcast vs. direct assignment**: Some platforms broadcast the order to nearby drivers and let them claim it (first-come-first-served). Others assign directly to the best-matched driver. Direct assignment is more efficient; broadcast gives drivers more autonomy
- **Fallback logic**: If no driver accepts within a timeout, widen the search radius, increase the driver incentive, or notify the customer of a delay

### Real-Time GPS Tracking

Once a driver is assigned, both the customer and the platform track the driver's location:

- **Driver app sends location**: GPS pings every 3-10 seconds via the driver's mobile app. These are pushed to the server via WebSockets or a lightweight protocol
- **Location processing**: Server receives location updates, smooths noisy GPS data, snaps coordinates to roads (map matching), and stores the trajectory
- **Customer-facing map**: The customer sees the driver's position on a map, updated in near real-time. This is typically powered by WebSockets or server-sent events pushing updates to the customer app
- **ETA recalculation**: As the driver moves, the estimated arrival time updates continuously based on actual position, traffic conditions, and remaining route
- **Geofence triggers**: When the driver enters a geofence around the restaurant ("arrived at restaurant") or the customer's address ("arrived at destination"), the system automatically updates the order status

### Surge / Dynamic Pricing

When demand exceeds driver supply, prices go up:

- **Demand signals**: High order volume in a zone, low driver availability, bad weather, major events, peak meal times
- **Surge multiplier**: The delivery fee or service fee increases by a multiplier (1.5x, 2x). Some platforms apply surge to the entire order; others only to the delivery fee
- **Supply incentive**: Higher surge means higher driver earnings, which pulls more drivers into the busy zone
- **Customer transparency**: Show the customer the surge factor before they order. Hiding surge pricing destroys trust and may violate regulations
- **Zone-based calculation**: The city is divided into hexagonal or rectangular zones. Surge is calculated per zone based on local supply-demand balance
- **Cooldown and caps**: Surge multipliers typically have a maximum cap and gradually decrease as supply responds

### Order Lifecycle States

A food delivery order moves through a well-defined state machine:

```
placed → accepted → preparing → ready_for_pickup → driver_assigned →
  driver_at_restaurant → picked_up → in_transit → arrived → delivered

Alternate paths:
  placed → rejected (restaurant declines)
  placed → cancelled (customer cancels before acceptance)
  accepted → cancelled (customer cancels, may incur fee)
  any state → support_escalation (issue reported)
```

Each state transition triggers side effects: `accepted` starts the preparation timer, `driver_assigned` sends the driver details to the customer, `picked_up` starts the delivery ETA countdown, `delivered` triggers payment capture and prompts for ratings.

### Estimated Delivery Time (EDT) Calculation

The delivery time estimate shown to the customer is a composite of three predictions:

1. **Preparation time**: How long the restaurant takes to make the food. Based on historical data for that restaurant, adjusted for current order volume and time of day
2. **Driver arrival at restaurant**: Time for the assigned (or nearest available) driver to reach the restaurant. Based on distance and real-time traffic
3. **Delivery time**: Time from restaurant to customer address. Based on route distance, traffic, and driver's vehicle type

EDT = max(preparation_time, driver_arrival_time) + delivery_time + buffer

The buffer accounts for parking, finding the apartment, elevator wait, and other last-mile friction. Getting EDT wrong in either direction is bad: underestimates frustrate customers; overestimates reduce order conversion.

### Ratings and Reviews

Both drivers and restaurants receive ratings:

- **Restaurant ratings**: Customer rates food quality (1-5 stars) after delivery. Can also leave text reviews. These affect the restaurant's search ranking and visibility on the platform
- **Driver ratings**: Customer rates the delivery experience. Factors: speed, food condition on arrival, communication. Drivers below a rating threshold (e.g., 4.2) may be deactivated
- **Customer ratings**: Drivers can rate customers too. Low-rated customers may face deprioritized dispatch or additional fees
- **Photo reviews**: Some platforms allow customers to upload photos comparing what they received versus what was advertised
- **Rating freshness**: Recent ratings are weighted more heavily than old ones. A restaurant that improved shouldn't be penalized forever for early mistakes

### Delivery Zones and Geofencing

Not every restaurant delivers everywhere:

- **Delivery radius**: Each restaurant has a maximum delivery distance (typically 3-8 km). Orders outside this radius are not offered
- **Zone-based operations**: The platform divides the city into operational zones. Each zone has its own driver supply pool, surge pricing, and operational parameters
- **Geofencing**: Virtual boundaries around restaurants, customer clusters, and city limits. Used for driver dispatch, surge calculation, and determining which restaurants are available to a given customer address
- **Expansion**: New zones are launched carefully — ensuring enough restaurant supply and driver coverage before going live
- **Restricted areas**: Some locations (airports, gated communities, military bases) have special delivery instructions or are excluded entirely

### Kitchen Display Systems (KDS)

For integrated restaurants, orders appear on a kitchen display:

- **Order queue**: Shows incoming orders sorted by time, with preparation countdown timers
- **Item-level status**: Kitchen staff mark individual items as "preparing" and "ready." When all items are ready, the order status updates to `ready_for_pickup`
- **Prep time feedback**: If a restaurant consistently marks orders ready in 12 minutes but was estimated at 20, the system learns and adjusts future EDT predictions
- **Busy mode**: Restaurants can signal they're overwhelmed, which temporarily increases estimated prep time or pauses new orders

### Multi-Restaurant Orders

Some platforms allow customers to order from multiple restaurants in a single checkout:

- **Split fulfillment**: Each restaurant portion is treated as a sub-order with its own preparation timeline
- **Driver coordination**: One driver picks up from both restaurants (if they're close) or two drivers are dispatched. The logistics complexity increases significantly
- **Partial delivery**: What happens if one restaurant cancels but the other doesn't? The customer gets a partial order and a partial refund
- **Most platforms avoid this** because of the complexity. The delivery time for the second restaurant's food degrades while the driver picks up the first order

### Tipping

Tips are a significant part of driver compensation:

- **Pre-delivery tip**: Customer sets a tip amount at checkout. This is shown to drivers during dispatch and influences acceptance rates
- **Post-delivery tip adjustment**: After delivery, the customer can increase, decrease, or remove the tip based on the experience
- **Platform policy**: Tips should go 100% to the driver. Platforms that skim tips face backlash and regulatory action
- **Default suggestions**: The checkout flow shows tip suggestions (e.g., 10%, 15%, 20%, or a custom amount). The default selection significantly influences tipping behavior

### Promotions and Coupons

Promotions drive order volume but are expensive:

- **Types**: Free delivery, percentage discount, flat amount off, buy-one-get-one, first-order bonus, referral credits
- **Funding**: Some promotions are platform-funded (customer acquisition cost), others are restaurant-funded (marketing investment), and some are split
- **Stacking rules**: Can a customer use a coupon and a promotion simultaneously? Most platforms limit stacking to control costs
- **Fraud prevention**: Detect users creating multiple accounts to abuse first-order promotions. Track device fingerprints, payment methods, and delivery addresses
- **Targeting**: Different promotions for different user segments — lapsed users get re-engagement offers, high-value users get loyalty rewards, price-sensitive users get discounts on off-peak hours

## Key Terms You'll Hear

| Term | What It Means |
|------|---------------|
| **Dark kitchen / Ghost kitchen** | A restaurant that operates exclusively for delivery — no dine-in, no storefront. Lower overhead, optimized for delivery speed |
| **Dispatch** | The algorithm that assigns drivers to orders. The most critical system in the platform |
| **Batching** | Combining multiple orders into a single driver trip to improve efficiency |
| **Surge pricing** | Increasing fees during high-demand periods to balance supply and demand |
| **EDT / ETA** | Estimated Delivery Time / Estimated Time of Arrival. The promise shown to the customer |
| **Prep time** | How long the restaurant takes to prepare the order after accepting it |
| **Geofence** | A virtual boundary on a map that triggers actions when a driver enters or exits |
| **Take rate** | The percentage of order value the platform keeps as commission (typically 15-30%) |
| **AOV** | Average Order Value. Key metric that drives unit economics |
| **Dayparting** | Showing different menus or pricing based on time of day |
| **Last mile** | The final leg of delivery — from a local hub or restaurant to the customer's door |
| **Driver utilization** | Percentage of a driver's online time spent actively delivering. Higher is better for driver earnings |
| **Basket incentive** | Minimum order amount required for free delivery, encouraging customers to add more items |
| **KDS** | Kitchen Display System. The screen in the restaurant that shows incoming orders |
| **Map matching** | Snapping raw GPS coordinates to known road segments for accurate tracking |

## Common Patterns

### Three-App Architecture

Most food delivery platforms maintain three separate applications: a **customer app** (browse, order, track), a **restaurant app/tablet** (receive orders, manage menu, mark items ready), and a **driver app** (accept deliveries, navigate, confirm pickup/dropoff). Each has fundamentally different UX requirements and update cadences. The driver app must work well on low-end phones with poor connectivity. The restaurant app must handle a noisy kitchen environment with large touch targets.

### Event-Driven Order Pipeline

Order state changes flow through an event bus (Kafka, SQS, or similar). Each state transition publishes an event that downstream services consume independently: the notification service sends a push notification, the tracking service updates the map, the billing service adjusts the charge, and the analytics service logs the event. This decoupling is essential because adding a new consumer (say, a fraud detection service) shouldn't require modifying the order service.

### Dual ETA Display

Show two time estimates: one for when the food will be ready (prep time) and one for when the food will arrive (total delivery time). Internally, track both independently and dispatch the driver to arrive at the restaurant when preparation completes — not when the order is placed.

### Driver Incentive Structures

Beyond per-delivery fees, platforms use incentive programs to shape driver behavior: quest bonuses ("complete 10 deliveries by 2 PM, earn $20 extra"), peak-hour multipliers, consecutive-trip bonuses, and zone-based incentives to attract drivers to underserved areas. These are tuned constantly based on supply-demand data.

### Restaurant Tiering

Segment restaurants into tiers based on order volume, quality ratings, and reliability. Top-tier restaurants get better search placement, faster driver assignment, and access to premium promotions. This creates a flywheel: better placement leads to more orders, which leads to better metrics, which reinforces the placement.

## Gotchas

- **Stale menus**: If a restaurant runs out of chicken but doesn't update the app, the customer orders it, the restaurant rejects it, and everyone is frustrated. Build real-time item availability toggling and consider auto-disabling items that get rejected frequently
- **GPS drift indoors**: When a driver enters a building, GPS accuracy drops to 50+ meters. The tracking map shows the driver circling randomly. Use geofence arrival detection rather than precise GPS for "arrived" status
- **Driver assignment before food is ready**: If you dispatch too early, the driver waits at the restaurant unpaid and gets frustrated. If you dispatch too late, the food sits on the counter getting cold. Calibrating this timing is an ongoing optimization problem
- **Refund abuse**: Customers claim food was missing or wrong to get free meals. Track refund frequency per customer, require photo evidence, and flag serial abusers. But be careful — legitimate complaints must not be dismissed
- **Multi-app order conflicts**: If a restaurant is on multiple platforms (DoorDash, Uber Eats, Grubhub), they get slammed with orders from all channels simultaneously. Without POS integration, the kitchen gets overwhelmed and prep times balloon
- **Payment capture timing**: You authorize payment when the order is placed but capture when it's delivered. If the final amount changes (item substitution, partial cancellation), you need to adjust the capture amount. Some payment processors limit how long an authorization hold lasts (typically 7 days)
- **Driver safety and insurance**: Drivers are often classified as independent contractors, which creates liability and insurance complexity. Accidents during delivery raise questions about coverage that the platform must address
- **Cold food complaints**: The biggest quality issue. Long delivery times, poor insulation, and batched orders all contribute. Track food quality ratings by delivery duration and penalize excessively long deliveries in the dispatch algorithm
- **Tip baiting**: Customers set a high pre-delivery tip to attract a driver quickly, then reduce it to zero after delivery. Some platforms lock tips after a short window to prevent this

## Quick Reference

```
Three Parties: Customer ↔ Platform ↔ Restaurant + Driver

Order Flow:
  browse → cart → checkout → restaurant accepts → kitchen prepares →
  driver dispatched → driver picks up → in transit → delivered → rated

State Machine:
  placed → accepted → preparing → ready_for_pickup →
  driver_assigned → picked_up → in_transit → delivered

EDT Calculation:
  EDT = max(prep_time, driver_to_restaurant) + restaurant_to_customer + buffer

Dispatch Factors:
  Driver proximity to restaurant | Food prep time remaining |
  Driver rating | Batching opportunity | Vehicle type

Revenue Streams:
  Restaurant commission (15-30%) | Delivery fee | Service fee |
  Surge pricing | Promoted listings | Subscription (delivery pass)

Three Apps:
  Customer app  → browse, order, track, rate
  Restaurant app → receive orders, manage menu, mark ready
  Driver app     → accept jobs, navigate, confirm pickup/dropoff

Key Metrics:
  EDT accuracy | Order completion rate | Driver utilization |
  Customer retention | AOV | Take rate | Refund rate

Pricing Components:
  Item subtotal + modifier deltas + delivery fee + service fee +
  surge multiplier + tax - promotions - coupons + tip = total

Rating System:
  Restaurant ← Customer (food quality)
  Driver ← Customer (delivery experience)
  Customer ← Driver (pickup experience)
```
