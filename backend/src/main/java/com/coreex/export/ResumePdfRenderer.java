package com.coreex.export;

import java.io.IOException;

/**
 * Draws a Resume as a PDF with the editor's templates. Throws when it cannot, and the export then lists that PDF as
 * omitted; the rest of the export is never failed by it.
 */
public interface ResumePdfRenderer {

	byte[] render(ResumePdfRequest request) throws IOException;

}
