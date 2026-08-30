#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, String, Symbol};

/// Storage key prefix for per-event capacity limits.
const KEY_CAP: Symbol = symbol_short!("vcap");
/// Storage key prefix for per-event attendance counters.
const KEY_CNT: Symbol = symbol_short!("vcnt");

/// Persisted capacity record for a single event.
#[contracttype]
#[derive(Clone)]
pub struct VenueCapacity {
    /// Maximum number of attendees allowed.
    pub max_capacity: u32,
}

/// Persisted attendance counter for a single event.
#[contracttype]
#[derive(Clone)]
pub struct AttendanceCounter {
    /// Current number of minted / registered attendees.
    pub count: u32,
}

#[contract]
pub struct VenueCapacityContract;

#[contractimpl]
impl VenueCapacityContract {
    /// Set (or update) the maximum capacity for an event.
    ///
    /// Emits a **VenueCapacitySet** event carrying `(event_id, max_capacity)`.
    pub fn set_venue_capacity(env: Env, event_id: String, max_capacity: u32) {
        let key = (KEY_CAP, event_id.clone());
        let record = VenueCapacity { max_capacity };
        env.storage().persistent().set(&key, &record);

        #[allow(deprecated)]
        env.events().publish(
            (Symbol::new(&env, "VenueCapacitySet"),),
            (event_id, max_capacity),
        );
    }

    /// Increment the attendance counter for an event.
    ///
    /// Panics with **"venue at capacity"** if the counter has already reached
    /// the configured maximum, preventing any further ticket minting.
    pub fn increment_attendance_counter(env: Env, event_id: String) {
        // Read current capacity limit (panics if never configured).
        let cap_key = (KEY_CAP, event_id.clone());
        let cap: VenueCapacity = env
            .storage()
            .persistent()
            .get::<(Symbol, String), VenueCapacity>(&cap_key)
            .expect("venue capacity not set for this event");

        // Read current counter, defaulting to 0.
        let cnt_key = (KEY_CNT, event_id.clone());
        let mut counter: AttendanceCounter = env
            .storage()
            .persistent()
            .get::<(Symbol, String), AttendanceCounter>(&cnt_key)
            .unwrap_or(AttendanceCounter { count: 0 });

        if counter.count >= cap.max_capacity {
            panic!("venue at capacity");
        }

        counter.count = counter.count.saturating_add(1);
        env.storage().persistent().set(&cnt_key, &counter);

        #[allow(deprecated)]
        env.events().publish(
            (Symbol::new(&env, "AttendanceIncremented"),),
            (event_id, counter.count),
        );
    }

    /// Return `true` when the event is at or over its maximum capacity,
    /// meaning any further ticket mint should be rejected.
    ///
    /// Returns `false` if no capacity has been configured (treat as unlimited).
    pub fn reject_over_capacity_mint(env: Env, event_id: String) -> bool {
        let cap_key = (KEY_CAP, event_id.clone());
        let cap_opt = env
            .storage()
            .persistent()
            .get::<(Symbol, String), VenueCapacity>(&cap_key);

        // If no capacity limit is set, minting is always allowed.
        let cap = match cap_opt {
            Some(c) => c,
            None => return false,
        };

        let cnt_key = (KEY_CNT, event_id.clone());
        let counter: AttendanceCounter = env
            .storage()
            .persistent()
            .get::<(Symbol, String), AttendanceCounter>(&cnt_key)
            .unwrap_or(AttendanceCounter { count: 0 });

        counter.count >= cap.max_capacity
    }
}

#[cfg(test)]
mod venue_capacity_tests {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn set_and_check_capacity() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(VenueCapacityContract, ());
        let client = VenueCapacityContractClient::new(&env, &contract_id);

        let event = soroban_sdk::String::from_str(&env, "event-abc");
        client.set_venue_capacity(&event, &2u32);

        // No attendees yet — should not reject.
        assert!(!client.reject_over_capacity_mint(&event));
    }

    #[test]
    fn increment_and_reject_at_capacity() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(VenueCapacityContract, ());
        let client = VenueCapacityContractClient::new(&env, &contract_id);

        let event = soroban_sdk::String::from_str(&env, "event-xyz");
        client.set_venue_capacity(&event, &1u32);

        client.increment_attendance_counter(&event);

        // Now at capacity — should reject.
        assert!(client.reject_over_capacity_mint(&event));
    }

    #[test]
    #[should_panic(expected = "venue at capacity")]
    fn increment_beyond_capacity_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(VenueCapacityContract, ());
        let client = VenueCapacityContractClient::new(&env, &contract_id);

        let event = soroban_sdk::String::from_str(&env, "event-full");
        client.set_venue_capacity(&event, &1u32);

        client.increment_attendance_counter(&event); // OK
        client.increment_attendance_counter(&event); // should panic
    }

    #[test]
    fn no_capacity_set_allows_mint() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(VenueCapacityContract, ());
        let client = VenueCapacityContractClient::new(&env, &contract_id);

        let event = soroban_sdk::String::from_str(&env, "event-unlimited");

        // No capacity configured — reject should return false.
        assert!(!client.reject_over_capacity_mint(&event));
    }
}
