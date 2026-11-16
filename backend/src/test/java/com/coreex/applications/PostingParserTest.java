package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Reading a job posting out of a page: its JobPosting data first, else its title and text. */
class PostingParserTest {

	private static String page(String head, String body) {
		return "<!doctype html><html><head>" + head + "</head><body>" + body + "</body></html>";
	}

	private static String ld(String json) {
		return "<script type=\"application/ld+json\">" + json + "</script>";
	}

	private static final String POSTING = """
			{"@context":"https://schema.org","@type":"JobPosting","title":"Senior Engineer",
			 "hiringOrganization":{"@type":"Organization","name":"Acme Corp"},
			 "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Berlin",
			   "addressRegion":"BE","addressCountry":"DE"}},
			 "description":"<p>We build <b>things</b> &amp; more.</p><ul><li>Rust</li><li>Go</li></ul>"}""";

	@Test
	void jobPostingDataGivesTheFieldsAndAPlainTextPosting() {
		var read = PostingParser.parse(page("<title>Whatever</title>" + ld(POSTING), "<p>cookie banner</p>"));

		assertThat(read.structured()).isTrue();
		assertThat(read.role()).isEqualTo("Senior Engineer");
		assertThat(read.company()).isEqualTo("Acme Corp");
		assertThat(read.location()).isEqualTo("Berlin, BE, DE");
		assertThat(read.text()).contains("We build things & more.").contains("- Rust").contains("- Go")
				.doesNotContain("<").doesNotContain("cookie banner");
	}

	@Test
	void theJobPostingCanSitInAGraphAnArrayOrAListOfTypes() {
		var graph = ld("{\"@context\":\"https://schema.org\",\"@graph\":[{\"@type\":\"WebSite\",\"name\":\"Site\"},"
				+ "{\"@type\":[\"JobPosting\",\"Thing\"],\"title\":\"Designer\",\"hiringOrganization\":\"Beta Ltd\","
				+ "\"description\":\"Draw.\"}]}");
		var array = ld("[{\"@type\":\"Organization\",\"name\":\"X\"},{\"@type\":\"JobPosting\",\"title\":\"Analyst\","
				+ "\"hiringOrganization\":{\"name\":\"Gamma\"},\"description\":\"Count.\"}]");

		var fromGraph = PostingParser.parse(page(graph, ""));
		var fromArray = PostingParser.parse(page(array, ""));

		assertThat(fromGraph.structured()).isTrue();
		assertThat(fromGraph.role()).isEqualTo("Designer");
		assertThat(fromGraph.company()).isEqualTo("Beta Ltd");
		assertThat(fromArray.role()).isEqualTo("Analyst");
		assertThat(fromArray.company()).isEqualTo("Gamma");
	}

	@Test
	void aRemoteJobSaysRemoteAndSeveralPlacesAreJoined() {
		var remote = PostingParser.parse(page(ld("{\"@type\":\"JobPosting\",\"title\":\"Dev\","
				+ "\"hiringOrganization\":{\"name\":\"Acme\"},\"jobLocationType\":\"TELECOMMUTE\",\"description\":\"x\"}"), ""));
		var several = PostingParser.parse(page(ld("{\"@type\":\"JobPosting\",\"title\":\"Dev\","
				+ "\"hiringOrganization\":{\"name\":\"Acme\"},\"jobLocation\":[{\"address\":{\"addressLocality\":\"Paris\"}},"
				+ "{\"address\":{\"addressLocality\":\"Lyon\"}}],\"description\":\"x\"}"), ""));

		assertThat(remote.location()).isEqualTo("Remote");
		assertThat(several.location()).isEqualTo("Paris; Lyon");
	}

	@Test
	void aDescriptionThatIsEscapedHtmlIsReadAsTextToo() {
		var read = PostingParser.parse(page(ld("{\"@type\":\"JobPosting\",\"title\":\"Dev\","
				+ "\"hiringOrganization\":{\"name\":\"Acme\"},\"description\":\"&lt;p&gt;Hello &lt;b&gt;there&lt;/b&gt;&lt;/p&gt;\"}"), ""));

		assertThat(read.text()).isEqualTo("Hello there");
	}

	@Test
	void withoutJobPostingDataItFallsBackToTheTitleTheSiteNameAndTheVisibleText() {
		var read = PostingParser.parse(page(
				"<title>Platform Engineer | Delta Careers</title><meta property=\"og:site_name\" content=\"Delta\">"
						+ "<style>body{color:red}</style>" + ld("{\"@type\":\"Organization\",\"name\":\"Delta Inc\"}"),
				"<nav>Home Jobs</nav><main><h1>Platform Engineer</h1><p>Run the <i>platform</i>.</p></main>"
						+ "<script>var x = 1;</script><footer>Legal</footer>"));

		assertThat(read.structured()).isFalse();
		assertThat(read.role()).isEqualTo("Platform Engineer | Delta Careers");
		assertThat(read.company()).isEqualTo("Delta");
		assertThat(read.text()).contains("Platform Engineer").contains("Run the platform.").doesNotContain("var x")
				.doesNotContain("color:red").doesNotContain("Legal").doesNotContain("Home Jobs");
	}

	@Test
	void brokenJsonAndAnEmptyPageGiveEmptyFieldsInsteadOfAnError() {
		var broken = PostingParser.parse(page(ld("{\"@type\": \"JobPosting\", \"title\": "), "<p>Text</p>"));
		var empty = PostingParser.parse("");

		assertThat(broken.structured()).isFalse();
		assertThat(broken.text()).isEqualTo("Text");
		assertThat(empty.structured()).isFalse();
		assertThat(empty.role()).isEmpty();
		assertThat(empty.company()).isEmpty();
		assertThat(empty.text()).isEmpty();
	}

	@Test
	void aHostilePageOfUnclosedTagsIsReadInAFewSecondsNotMinutes() {
		var pages = new String[] { "<nav>".repeat(150_000), "<<<<<<<<".repeat(100_000) + ">", "<script>".repeat(100_000),
				"<title>".repeat(100_000), "<meta property=\"og:site_name\" ".repeat(60_000), "<!-- ".repeat(100_000),
				"<script type=\"application/ld+json\">".repeat(50_000) };
		var started = System.nanoTime();

		for (var html : pages) {
			PostingParser.parse(html);
		}

		assertThat((System.nanoTime() - started) / 1_000_000).as("milliseconds for all of them").isLessThan(3_000);
	}

	@Test
	void everyFieldIsCutToWhatAnApplicationAccepts() {
		var long200 = "x".repeat(300);
		var read = PostingParser.parse(page(ld("{\"@type\":\"JobPosting\",\"title\":\"" + long200
				+ "\",\"hiringOrganization\":{\"name\":\"" + long200 + "\"},\"jobLocation\":{\"address\":{\"addressLocality\":\""
				+ long200 + "\"}},\"description\":\"" + "y".repeat(120_000) + "\"}"), ""));

		assertThat(read.role()).hasSize(90);
		assertThat(read.company()).hasSize(90);
		assertThat(read.location()).hasSize(200);
		assertThat(read.text()).hasSize(100_000);
	}

}
