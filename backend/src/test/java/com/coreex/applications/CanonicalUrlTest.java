package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The canonical address of a posting: what makes two links the same job. */
class CanonicalUrlTest {

	@Test
	void trackingAndSecretParametersAreDroppedAndJobIdsKept() {
		assertThat(CanonicalUrl.of("https://jobs.example.com/careers/42?utm_source=li&utm_medium=x&gclid=abc&ref=home&token=s3cret&gh_jid=987"))
				.isEqualTo("https://jobs.example.com/careers/42?gh_jid=987");
		assertThat(CanonicalUrl.of("https://www.linkedin.com/jobs/view/?currentJobId=3333&trackingId=zzz&refId=q"))
				.isEqualTo("https://linkedin.com/jobs/view?currentjobid=3333");
		assertThat(CanonicalUrl.of("https://x.example/p?session=1&auth=2&key=3&api_key=4&access_token=5")).isEqualTo("https://x.example/p");
	}

	@Test
	void theHostIsLowerCaseWithoutWwwAndTheDefaultPortAndTheFragmentAndACredentialAreGone() {
		assertThat(CanonicalUrl.of("HTTPS://WWW.Jobs.Example.COM:443/Careers/Dev#apply")).isEqualTo("https://jobs.example.com/Careers/Dev");
		assertThat(CanonicalUrl.of("http://www.example.com:80/a")).isEqualTo("http://example.com/a");
		assertThat(CanonicalUrl.of("https://example.com:8443/a")).isEqualTo("https://example.com:8443/a");
		assertThat(CanonicalUrl.of("https://user:pass@example.com/a")).isEqualTo("https://example.com/a");
	}

	@Test
	void aTrailingSlashDoesNotMakeADifferentPostingAndTheRootStaysARoot() {
		assertThat(CanonicalUrl.of("https://example.com/jobs/1/")).isEqualTo("https://example.com/jobs/1");
		assertThat(CanonicalUrl.of("https://example.com/")).isEqualTo("https://example.com/");
		assertThat(CanonicalUrl.of("https://example.com")).isEqualTo("https://example.com/");
	}

	@Test
	void jobIdParametersAreSortedSoTheirOrderDoesNotMatter() {
		assertThat(CanonicalUrl.of("https://x.example/p?job_id=2&gh_jid=1")).isEqualTo(CanonicalUrl.of("https://x.example/p?gh_jid=1&job_id=2"));
		assertThat(CanonicalUrl.of("https://x.example/p?jobId=7")).isEqualTo(CanonicalUrl.of("https://x.example/p?JOBID=7"));
	}

	@Test
	void twoLinksToTheSameJobHaveTheSameCanonicalAddressAndDifferentJobsDoNot() {
		assertThat(CanonicalUrl.of("https://www.jobs.example/job/123?utm_source=x&gh_jid=77#top"))
				.isEqualTo(CanonicalUrl.of("https://jobs.example/job/123/?gh_jid=77&utm_campaign=y"));
		assertThat(CanonicalUrl.of("https://jobs.example/job/123?gh_jid=77")).isNotEqualTo(CanonicalUrl.of("https://jobs.example/job/123?gh_jid=78"));
		assertThat(CanonicalUrl.of("https://jobs.example/job/123")).isNotEqualTo(CanonicalUrl.of("https://jobs.example/job/124"));
	}

	@Test
	void anythingThatIsNotAWebAddressHasNoCanonicalAddress() {
		for (var text : new String[] { "", "   ", null, "not a url", "ftp://example.com/x", "mailto:a@b.c", "javascript:alert(1)", "http://" }) {
			assertThat(CanonicalUrl.of(text)).as(String.valueOf(text)).isEmpty();
		}
	}

}
