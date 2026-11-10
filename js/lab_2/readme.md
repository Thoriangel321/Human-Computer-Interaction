Entity Architecture

Composition over Inheritance:
To add new features like "homing" (chasing a target) and "pickups" (health packs), we avoided deep class hierarchies.

The Problem with Inheritance: If we used classes, we would need to create rigid structures like HomingAsteroid or HealthPickup. This leads to code duplication if we ever want a combination, like a HomingPickup.
Our Solution (Composition): We used plain functions (mixins) like withHoming(entity) and withPickup(entity). These functions simply add new behaviors to a basic Entity on the fly. This keeps the architecture flat, highly modular, and easy to maintain.
