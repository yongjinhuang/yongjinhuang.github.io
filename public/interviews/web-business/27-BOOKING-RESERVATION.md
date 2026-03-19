# Booking & Reservation Systems

## What Is It?

A booking and reservation system lets users claim a finite resource for a specific time — a hotel room for two nights, a table at 7 PM, a doctor's appointment at 3:30, or a seat at a concert. At its core, you're managing availability (what's open), holds (temporarily locking a slot), and confirmations (making it official). The tricky part is that multiple people can try to book the same slot simultaneously, availability changes constantly, and business rules around cancellations, no-shows, and overbooking add real complexity.

## Why Should You Care?

Booking systems are everywhere — Airbnb, OpenTable, Calendly, Eventbrite, airline websites, healthcare portals. If you're building anything where users reserve time, space, or capacity, you'll encounter these patterns. The business stakes are high: a double-booking means two angry customers, a missed reminder means a no-show that costs the business revenue, and poor availability management means either lost sales (showing "full" when you're not) or overbooking chaos. Understanding the lifecycle, concurrency challenges, and cancellation economics separates a working prototype from a production-ready system.

## How It Works (The Business Flow)

### The Booking Lifecycle

1. **Search**: User specifies what they want — date, time, location, party size, resource type. System queries available inventory.
2. **Select**: User picks a specific slot or option from results. System checks real-time availability.
3. **Hold (Temporary Lock)**: System places a temporary hold on the slot (typically 5-15 minutes) so no one else can grab it while the user completes checkout. This is critical for preventing double-bookings.
4. **Confirm**: User provides payment or final details. System converts the hold into a confirmed reservation and decrements available inventory.
5. **Remind**: System sends confirmation immediately, then follow-up reminders (24 hours before, 1 hour before). Often via email, SMS, or push notification.
6. **Complete or Cancel**: The booking either happens as planned (check-in, appointment attended, event occurs) or gets cancelled — triggering refund logic, waitlist promotion, and inventory release.

### Availability Management

There are three common models for tracking what's bookable:

- **Slot-based**: Discrete time blocks (e.g., 9:00 AM, 9:30 AM, 10:00 AM). Used by appointment schedulers, salons, clinics. Each slot has a fixed capacity (usually 1). The system generates slots from provider schedules and removes booked ones from the available list.
- **Calendar/date-range**: Continuous date ranges with per-day inventory (e.g., 12 rooms available on March 15). Used by hotels, vacation rentals. Booking spans multiple days and must check availability across the entire range — if any single night in a 5-night stay is sold out, the whole stay is unavailable.
- **Inventory/seat-based**: A pool of countable units (e.g., 500 seats, 200 tickets). Used by events, flights, classes. Each booking decrements the count. Often paired with seat maps for assigned seating.

Availability data must update in near real-time. Stale caches showing "available" when a slot is actually booked create a terrible user experience — the user goes through the whole checkout only to be told at the end that the slot is gone.

### Concurrency: The Double-Booking Problem

Two users click "Book" on the last available slot at the same time. Without proper handling, both succeed and you've double-booked. Solutions include:

- **Pessimistic locking**: Lock the row in the database when a user starts booking. Others wait or get rejected. Simple, but can cause bottlenecks.
- **Optimistic locking**: Allow both to proceed, but use a version number or timestamp. The second write detects the conflict and fails gracefully.
- **Temporary holds**: Reserve the slot for a short window. If the user doesn't complete in time, the hold expires and inventory is released back.

### Overbooking Strategies

Some industries intentionally sell more than capacity:

- **Airlines**: Overbook by 5-15% because a predictable percentage of passengers won't show. The math works most of the time. When it doesn't, they offer compensation and bump passengers.
- **Hotels**: Similar logic — overbook expecting cancellations and no-shows. If caught short, they "walk" guests to partner hotels and cover the cost.
- **Restaurants**: Less common, but some overbook slightly on high-demand nights, betting on cancellations.

The key is data. Overbooking only works when you have historical no-show rates and the cost of an empty slot exceeds the cost of handling an overflow.

### Cancellation Policies

How you handle cancellations directly affects revenue:

- **Free cancellation**: Full refund anytime before the booking. Maximum flexibility for the user, maximum risk for the business. Common for hotels trying to win bookings early.
- **Flexible**: Free cancellation up to X hours/days before. After that, a partial charge applies. The sweet spot for most businesses.
- **Moderate**: Partial refund if cancelled within a window (e.g., 50% refund if cancelled 48+ hours before).
- **Strict / Non-refundable**: No refund after booking. Lower price offered in exchange. Airlines and discount hotels use this heavily.

Most systems implement tiered policies with a `cancellation_deadline` timestamp calculated at booking time. After the deadline, the refund percentage drops.

### Waitlists

When a slot is full, users can join a waitlist. When a cancellation happens:

1. System releases the slot back to inventory.
2. First person on the waitlist gets notified (email/SMS).
3. They have a limited time window (e.g., 30 minutes) to confirm.
4. If they don't confirm, the system moves to the next person.
5. If no one claims it, the slot becomes publicly available again.

Waitlist priority can be simple (FIFO) or weighted by factors like loyalty status, booking value, or how long they've been waiting.

### Reminders and Confirmations

A solid reminder flow reduces no-shows significantly:

- **Immediate**: Booking confirmation with details, calendar invite (.ics file), cancellation link.
- **24-48 hours before**: Reminder with option to confirm, cancel, or modify. Some systems require active confirmation ("Reply YES to confirm").
- **1-2 hours before**: Final reminder, especially for appointments and restaurants.
- **Post-visit**: Follow-up for reviews, rebooking prompts, or feedback surveys.

### No-Show Handling

No-shows are costly. Common strategies:

- **Penalties**: Charge a no-show fee (common in restaurants and clinics). Requires a card on file.
- **Flagging**: Track no-show history per user. Frequent no-shows may face restrictions or require prepayment.
- **Overbooking buffer**: Accept more bookings than capacity to offset expected no-shows.
- **Confirmation gates**: Require users to confirm 24 hours before or the booking auto-cancels and goes to the waitlist.

## Key Terms You'll Hear

| Term                    | What It Means                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Availability**        | The remaining bookable inventory for a given time/date. Must be checked in real-time to prevent overselling |
| **Hold / Soft Lock**    | A temporary reservation that expires if not confirmed within a time window (usually 5-15 minutes)           |
| **Confirmed Booking**   | A reservation that's been finalized — payment taken, inventory decremented, confirmation sent               |
| **Overbooking**         | Intentionally accepting more bookings than capacity, betting on cancellations and no-shows                  |
| **No-Show**             | A confirmed booking where the customer doesn't appear. Costly for the business                              |
| **Waitlist**            | A queue of people waiting for a slot to open up. Triggered by cancellations or additional inventory         |
| **Buffer Time**         | Padding between bookings for cleanup, prep, or transition (e.g., 15 min between salon appointments)         |
| **Cancellation Window** | The deadline before which a user can cancel without penalty                                                 |
| **Dynamic Pricing**     | Adjusting prices based on demand, time until the event, remaining inventory, or seasonality                 |
| **Recurring Booking**   | A reservation that repeats on a schedule — weekly therapy sessions, monthly team meetings                   |
| **Walk-in**             | A customer who shows up without a reservation. Must be balanced with reserved capacity                      |
| **Block / Blackout**    | Marking certain dates or times as unavailable (holidays, maintenance, private events)                       |
| **Multi-Resource**      | A booking that requires coordinating multiple resources simultaneously — a room, a therapist, and equipment |
| **Group Booking**       | A single reservation for multiple people or units, often with special pricing or coordination needs         |

## Common Patterns

### Time Zone Handling

Store all times in UTC internally. Convert to the user's local time zone for display and to the venue's time zone for operations. A user in New York booking a restaurant in Los Angeles needs to see Pacific Time. Edge cases: bookings that cross DST transitions (a 2 AM appointment during "spring forward" doesn't exist). Always store the venue's IANA time zone identifier (e.g., `America/Los_Angeles`, not "PST") since offset-based representations don't account for DST changes.

### Buffer Time Between Bookings

A dentist appointment doesn't end at 10:30 and the next start at 10:30. You need cleanup, setup, and transition time. Model buffer as a property of the resource or booking type. A 30-minute appointment with a 10-minute buffer means the next available slot is 40 minutes later, not 30.

### Dynamic Pricing

Prices change based on demand signals: remaining inventory, days until the booking, day of week, season, and competitor pricing. Airlines and hotels are masters of this. Implementation typically involves a pricing rules engine that evaluates conditions at search time and returns the current price. Early-bird discounts, last-minute deals, and surge pricing are all variants. Important: always show the user the final price before they confirm. Bait-and-switch pricing (showing a low price in search, then charging more at checkout) destroys trust and may violate regulations.

### Recurring Bookings

User books "every Tuesday at 2 PM for 8 weeks." Generate individual booking instances from the recurrence rule. Handle conflicts per-instance (week 4 might overlap with a holiday block). Allow cancellation of single instances without breaking the series. Store the recurrence pattern (cron-like or RFC 5545 RRULE) separately from the generated instances. Common decision: do you generate all instances upfront (simpler queries, but updating the pattern means regenerating) or generate them on-the-fly (flexible, but complex availability checks)?

### Multi-Resource Scheduling

A medical procedure might need a specific doctor, an operating room, and an anesthesiologist — all available at the same time. Query availability as the intersection of all required resources. If any one is unavailable, the slot doesn't show. This is computationally expensive and benefits from pre-calculated availability windows.

### Group Bookings

A party of 12 at a restaurant or a corporate block of 20 hotel rooms. Often requires manual approval, custom pricing, and coordination. The system needs to handle partial confirmations (8 of 20 rooms confirmed so far) and group-level cancellation policies that differ from individual ones.

### Booking Modifications

Users want to change dates, times, or party size after booking. This is essentially a cancel-and-rebook operation, but the UX should feel like an edit. Check availability for the new slot, apply any price differences, preserve the original booking ID for tracking, and handle cancellation policy implications (does modifying reset the cancellation window?). Track a modification history so support agents can see what changed and when. Some businesses limit the number of modifications allowed to prevent abuse.

### Booking Statuses

A well-designed booking system tracks clear status transitions:

```
pending → held → confirmed → checked_in → completed
                     ↓              ↓
                 cancelled      no_show
```

Each status transition triggers side effects: `confirmed` sends a confirmation email, `cancelled` triggers a refund and waitlist promotion, `no_show` applies a penalty and flags the user. Model these as a state machine with explicit transition rules rather than ad-hoc status updates scattered across the codebase.

## Common Pitfalls

- **Ignoring race conditions**: Two users booking the last slot simultaneously. Without proper locking or atomic operations, you'll double-book. This is the number one bug in booking systems.
- **Holds that never expire**: If your hold expiration logic fails, inventory gets permanently locked. Always use server-side TTLs or scheduled cleanup jobs — never rely solely on client-side timers.
- **Time zone confusion**: Storing local times without time zone context leads to bookings at the wrong hour. Store UTC, display local, and always track which time zone the venue operates in.
- **No idempotency on confirmation**: If the user's payment succeeds but the confirmation API call times out, they might retry — creating a duplicate booking. Use idempotency keys to ensure the same confirmation request produces the same result.
- **Rigid cancellation logic**: Hardcoding cancellation rules makes it impossible for the business to run promotions like "free cancellation this month." Make policies configurable per listing, season, or customer tier.
- **Neglecting partial failures in multi-resource bookings**: You successfully book the room but fail to book the equipment. Now you have an incomplete reservation. Use transactions or sagas to ensure all-or-nothing booking across resources.
- **Calendar sync issues**: Users expect bookings to appear in Google Calendar or Outlook. Generating proper .ics files with correct time zones, recurrence rules, and update/cancel handling is surprisingly tricky.
- **Under-communicating**: Not sending enough reminders leads to no-shows. Not sending clear cancellation confirmations leads to disputes. Over-communicate booking status changes.
- **Not handling edge cases around midnight and DST**: A booking from 11 PM to 1 AM crosses a date boundary. A weekly recurring booking at 2 AM might not exist during spring-forward. Test these edge cases explicitly.
- **Forgetting about walk-ins**: If the system assumes all capacity is reservable, walk-in customers get turned away even when there's physical space. Many businesses hold back a percentage of capacity for walk-ins.

## Quick Reference

```
Search → Select → Hold (temp lock) → Confirm (payment) → Remind → Complete / Cancel

Availability Models:
  Slots        → appointments, classes (discrete blocks)
  Date-range   → hotels, rentals (spans multiple days)
  Inventory    → events, flights (countable units)

Cancellation Tiers:
  Free         → full refund, anytime
  Flexible     → free until X hours before, then partial
  Strict       → no refund after booking

No-Show Defense:
  Prepayment | Confirmation gates | Overbooking buffer | Penalty fees

Concurrency Defense:
  Pessimistic lock | Optimistic lock | Temporary holds with TTL

Status Flow:
  pending → held → confirmed → checked_in → completed
                       ↓              ↓
                   cancelled       no_show

Time Zones:
  Store UTC | Display local | Track venue IANA zone | Test DST edges

Key Data to Store Per Booking:
  booking_id, user_id, resource_id, status, start_time (UTC),
  end_time (UTC), timezone, created_at, confirmed_at,
  cancellation_deadline, cancellation_policy, price, payment_id,
  reminder_sent_at, no_show_flag, modification_history

Real-World Examples:
  Hotel      → date-range availability, overbooking, dynamic pricing, free cancellation
  Restaurant → slot-based, party size, waitlist, no-show penalties, walk-in buffer
  Doctor     → slot-based, multi-resource, buffer time, recurring, reminders
  Airline    → inventory-based, overbooking, strict cancellation, dynamic pricing
  Event      → inventory-based, group bookings, tiered seating, non-refundable
```
