package com.coreex.export;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ExportNamesTest {

	private final ExportNames names = new ExportNames();

	@Test
	void charactersAFileCannotHaveBecomeDashes() {
		assertThat(names.file("", "a/b:c?d*e\"f<g>h|i\\j", ".md")).isEqualTo("a-b-c-d-e-f-g-h-i-j.md");
		assertThat(names.file("", "tab\there", ".md")).isEqualTo("tab-here.md");
	}

	@Test
	void trailingDotsAndSpacesAreCutBecauseWindowsDropsThem() {
		assertThat(names.file("", "report. . ", ".md")).isEqualTo("report.md");
	}

	@Test
	void aWindowsReservedNameGetsAnUnderscoreInFront() {
		assertThat(names.file("", "CON", ".md")).isEqualTo("_CON.md");
		assertThat(names.file("", "aux", "")).isEqualTo("_aux");
		assertThat(names.file("", "COM1", ".md")).isEqualTo("_COM1.md");
		assertThat(names.file("", "nul.txt", "")).as("reserved whatever follows the dot").isEqualTo("_nul.txt");
		assertThat(names.file("", "console", ".md")).isEqualTo("console.md");
	}

	@Test
	void aLongTitleIsCutToOneHundredCharacters() {
		assertThat(names.file("", "x".repeat(150), ".md")).isEqualTo("x".repeat(100) + ".md");
	}

	@Test
	void anEmptyTitleIsUntitled() {
		assertThat(names.file("", "", ".md")).isEqualTo("Untitled.md");
		assertThat(names.file("", "  ", ".md")).isEqualTo("Untitled (2).md");
		assertThat(names.file("", "...", ".md")).isEqualTo("Untitled (3).md");
	}

	@Test
	void theSameNameInOneFolderGetsANumberIgnoringCase() {
		assertThat(names.file("A", "Plans", ".md")).isEqualTo("Plans.md");
		assertThat(names.file("A", "plans", ".md")).isEqualTo("plans (2).md");
		assertThat(names.file("A", "Plans", ".md")).isEqualTo("Plans (3).md");
		assertThat(names.file("B", "Plans", ".md")).as("another Folder has its own names").isEqualTo("Plans.md");
	}

	@Test
	void aFileAndAFolderOfTheSameNameDoNotClash() {
		assertThat(names.file("", "Plans", "")).isEqualTo("Plans");
		assertThat(names.folder("", "plans")).isEqualTo("plans (2)");
	}

	@Test
	void anExtensionAlreadyThereIsNotDoubled() {
		assertThat(names.file("A", "notes.md", ".md")).isEqualTo("notes.md");
		assertThat(names.file("B", "Notes.MD", ".md")).isEqualTo("Notes.MD");
		assertThat(names.file("", "diagram.png", "")).isEqualTo("diagram.png");
	}

	@Test
	void anAssetGetsAnExtensionFromItsTypeOnlyWhenItsTitleHasNone() {
		assertThat(ExportNames.extensionFor("diagram", "image/png")).isEqualTo(".png");
		assertThat(ExportNames.extensionFor("photo.jpeg", "image/jpeg")).isEmpty();
		assertThat(ExportNames.extensionFor("scan", "application/pdf")).isEqualTo(".pdf");
		assertThat(ExportNames.extensionFor("data", "application/x-unknown")).isEmpty();
		assertThat(ExportNames.extensionFor("v1.2 plan", "image/png")).as("a dot inside is not an extension").isEqualTo(".png");
	}

}
