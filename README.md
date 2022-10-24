# kindle-publication-check

A lambda for checking the status of the Guardian's Kindle publication.

Tests that:
1. the url for the current issue correctly redirects to an S3 path with today's date
2. the number of articles is above a certain threshold

If the tests pass, an email is sent with the article and image counts.
If the tests fail, an email is sent with the cause.

## Building

This project is built with github actions, and is driven by ./github/workflows/build.yml which pulls
its RiffRaff configuration from the ./riffraff.yaml file.

See [kindle-publication-check/actions/workflows/build.yml](https://github.com/guardian/kindle-publication-check/actions/workflows/build.yml)

It uploads to S3 at <riffraff artifact bucket>/Off-platform::kindle-publication-check/<build number>/... 
Note that Off-platform is specified as the destination prefix via the `projectName` property 
specified in ./github/workflows/build.yml

# Deploying

Deploy from RiffRaff using `Off-platform::kindle-publication-check`

