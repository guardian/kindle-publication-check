# kindle-publication-check

A lambda for checking the status of the Guardian's Kindle publication.

Tests that:
1. the url for the current issue correctly redirects to an S3 path with today's date
2. the number of articles is above a certain threshold

If the tests pass, an email is sent with the article and image counts.
If the tests fail, an email is sent with the cause.
