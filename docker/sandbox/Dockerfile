# The image every project's `run` check executes in. The runner adds the learner's requirements
# (wheels only, before the network is cut) and runs it with --network none, 2 CPUs and 4 GB.
FROM python:3.12-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends make git \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --uid 1000 --create-home --shell /usr/sbin/nologin sandbox
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
USER sandbox
WORKDIR /work
