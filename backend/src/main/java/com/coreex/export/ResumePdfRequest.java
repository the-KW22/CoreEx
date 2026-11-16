package com.coreex.export;

import com.coreex.resumes.ResumeDocument;

/** What the PDF needs: the Resume's document, and its photo as a data URL when the editor would show one. */
public record ResumePdfRequest(ResumeDocument document, String photoSrc) {
}
