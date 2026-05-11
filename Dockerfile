FROM ubuntu:noble

ARG TZ
ENV TZ="${TZ:-America/Los_Angeles}"
ENV PROJECT="oo7"

ARG CLAUDE_CODE_VERSION=latest
ARG NVM_VERSION=v0.40.1

# Postgres 16 is Noble's default — no third-party repo needed.
# build-essential / python3-pip are here because nvm/node-gyp needs them to
# compile native addons (libxmljs2 etc.) during yarn install.
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql \
    curl \
    ca-certificates \
    gnupg2 \
    build-essential \
    zip \
    less \
    git \
    procps \
    sudo \
    fzf \
    zsh \
    man-db \
    unzip \
    wget \
    iptables \
    ipset \
    iproute2 \
    dnsutils \
    aggregate \
    jq \
    nano \
    vim \
    python3-pip \
    ffmpeg \
    emacs-nox \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Replace Noble's default `ubuntu` UID-1000 user with `node` UID-1000 so the
# rest of the Dockerfile (chown lines, USER directives) and bind-mount UIDs
# from the macOS host stay consistent with the previous node:24-bookworm base.
RUN userdel -r ubuntu 2>/dev/null || true \
    && groupadd -g 1000 node \
    && useradd -m -u 1000 -g node -s /bin/bash node

ARG USERNAME=node

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

ARG PANDOC_VERSION=3.7.0.2
RUN ARCH=$(dpkg --print-architecture) && \
    wget "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-1-${ARCH}.deb" && \
    sudo dpkg -i "pandoc-${PANDOC_VERSION}-1-${ARCH}.deb" && \
    rm "pandoc-${PANDOC_VERSION}-1-${ARCH}.deb"

# Set up non-root user
USER node

# Mirror production: install nvm, then nvm-install the version this repo pins
# via .nvmrc (single source of truth — same file capistrano-nvm reads on the
# deploy host via config/deploy.rb). yarn is installed under that Node so it
# lives under $NVM_DIR/<version>/bin/yarn, matching prod's
# ~lessons-from-luke/.nvm/versions/node/v24.*/bin/yarn.
ENV NVM_DIR=/home/node/.nvm
COPY --chown=node:node .nvmrc /tmp/.nvmrc
RUN mkdir -p $NVM_DIR \
    && curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash \
    && bash -lc "source $NVM_DIR/nvm.sh \
                 && nvm install $(cat /tmp/.nvmrc) \
                 && nvm alias default $(cat /tmp/.nvmrc) \
                 && npm install -g yarn" \
    && ln -sf $NVM_DIR/versions/node/$(ls $NVM_DIR/versions/node | sort -V | tail -1) $NVM_DIR/current \
    && rm /tmp/.nvmrc

# Make node/npm/yarn discoverable in non-interactive shells (e.g.
# `docker compose exec ... yarn ...`) and from the runtime root user.
ENV PATH=$NVM_DIR/current/bin:/home/node/.local/bin:$PATH

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=emacs
ENV VISUAL=emacs

# Default powerline10k theme
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV UV_PROJECT_ENVIRONMENT=/var/local/env


# Install Claude
# RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Install SuperClaude
#RUN uv tool install superclaude
#RUN uv tool run superclaude install --components core mcp_docs modes agents mcp commands

RUN echo "alias cc='claude --dangerously-skip-permissions'" >> ~/.zshrc

# Copy and set up firewall script
COPY init-firewall.sh /usr/local/bin/
USER root

RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall
RUN mkdir -p /var/local/env && \
    chown node:node /var/local/env

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER node
# Configure git
RUN git config --global user.name "David Eyk" && git config --global user.email "david@worldsenoughstudios.com"

ENTRYPOINT ["/entrypoint.sh"]
