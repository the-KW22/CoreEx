package com.coreex.tags;

import java.util.UUID;

/** A label a User puts on Items. The name keeps the casing it was first typed with. */
public record Tag(UUID id, String name) {
}
