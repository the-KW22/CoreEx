package com.coreex.folders;

import java.util.UUID;

/** A container for Items and other Folders. A null parent means the top level. */
public record Folder(UUID id, UUID parentId, String name) {
}
