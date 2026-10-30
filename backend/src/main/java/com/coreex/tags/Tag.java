package com.coreex.tags;

import java.util.UUID;

/** A label a User puts on Items. The name keeps the casing it was first typed with; a null colour is automatic. */
public record Tag(UUID id, String name, String colour) {
}
