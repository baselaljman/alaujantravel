# Security Specification - Bus Booking App

## Data Invariants
1. A **Trip** must have a valid `from`, `to`, `date`, `time`, and `price`.
2. A **Booking** must be linked to an existing `tripId` and `userId`.
3. A **Parcel** must be linked to an existing `tripId`.
4. **Driver** can only update the status of trips assigned to them.
5. **Admin** has full access to all collections.
6. **User** can only read their own profile and bookings.
7. **Trip Status** update by non-admins is restricted to specific state transitions.

## The Dirty Dozen Payloads (Targeting Trip Status Update)

### 1. The "Ghost Status" Attack
**Intent:** Update trip status to an invalid value.
**Payload:** `{ "status": "exploit_state" }`
**Target:** `/trips/{tripId}`
**Expected:** `PERMISSION_DENIED` (Validation fails via `isValidTrip`)

### 2. The "Unauthorized Driver" Attack
**Intent:** A driver tries to update a trip not assigned to them.
**Payload:** `{ "status": "active" }`
**Target:** `/trips/{otherTripId}`
**Expected:** `PERMISSION_DENIED` (Relation check fails)

### 3. The "Shadow Field" Attack
**Intent:** Attendant tries to change trip price while updating status.
**Payload:** `{ "status": "active", "price": 0 }`
**Target:** `/trips/{tripId}`
**Expected:** `PERMISSION_DENIED` (`affectedKeys().hasOnly(['status'])` fails)

### 4. The "Orphaned Booking" Attack
**Intent:** Create a booking for a non-existent trip.
**Payload:** `{ "tripId": "non_existent", ... }`
**Expected:** `PERMISSION_DENIED` (`exists()` check fails)

### 5. The "Seat Stealing" Attack
**Intent:** User tries to book multiple seats by bypassing UI limits.
**Payload:** `{ "seatNumber": 999, ... }`
**Expected:** `PERMISSION_DENIED` (Out of bounds check)

### 6. The "Email Spoofing" Attack
**Intent:** Unverified user tries to access admin data.
**Payload:** Logged in with unverified email.
**Expected:** `PERMISSION_DENIED` (`email_verified` check fails)

### 7. The "PII Leak" Attack
**Intent:** Fetch all users list containing emails and phones.
**Expected:** `PERMISSION_DENIED` (Only `get` allowed for owners, `list` restricted)

### 8. The "Identity Takeover" Attack
**Intent:** Change `userId` in a booking during update.
**Payload:** `{ "userId": "victim_id" }`
**Expected:** `PERMISSION_DENIED` (Immutable field check)

### 9. The "Status Shortcut" Attack
**Intent:** Jump from `scheduled` to `completed` without `active`.
**Expected:** `PERMISSION_DENIED` (State machine validation - optional but good)

### 10. The "Denial of Wallet" Attack
**Intent:** Send 1MB string in `passengerName`.
**Expected:** `PERMISSION_DENIED` (`.size() <= 128` check)

### 11. The "Admin Privilege Escalation" Attack
**Intent:** User tries to set their own role to 'admin'.
**Payload:** `{ "role": "admin" }`
**Target:** `/users/{myUid}`
**Expected:** `PERMISSION_DENIED` (Role modification restricted)

### 12. The "Parcel Hijack" Attack
**Intent:** Update parcel status for a trip not assigned to driver.
**Expected:** `PERMISSION_DENIED` (Relational check via Trip)
