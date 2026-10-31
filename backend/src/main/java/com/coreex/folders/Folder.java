package com.coreex.folders;

import java.util.UUID;

/** A container for Items and other Folders. A null parent means the top level. itemCount is the live Items directly in it. */
public record Folder(UUID id, UUID parentId, String name, long itemCount) {
}
