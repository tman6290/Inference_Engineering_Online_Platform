# The image every project's `run` check executes in. The runner adds the learner's requirements
# (wheels only, before the network is cut) and runs it with --network none, 2 CPUs and 4 GB.
# The full python:3.12 image already ships make and git, so building needs only Docker Hub, not
# the Debian package mirrors (which some networks can't reach).
FROM python:3.12
RUN useradd --uid 1000 --create-home --shell /usr/sbin/nologin sandbox
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
USER sandbox
WORKDIR /work
