package com.coreex.notes;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The Import limits: configuration, not code. 1,000,000 bytes is also the longest a Note body may be in characters,
 * so an imported file can always be opened and saved again in the editor.
 */
@ConfigurationProperties("coreex.import")
record NoteImportProperties(@DefaultValue("1000000") long maxSizeBytes, @DefaultValue("20") int maxFiles) {
}
