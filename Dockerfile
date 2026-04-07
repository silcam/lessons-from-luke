FROM node:12.22.12-bullseye

ARG TZ
ENV TZ="${TZ:-America/Los_Angeles}"
ENV PROJECT="oo7"

ARG CLAUDE_CODE_VERSION=latest

# Install basic development tools and iptables/ipset
RUN apt-get update
RUN apt-get install -y --no-install-recommends \
    postgresql \
    zip \
    less \
    git \
    procps \
    sudo \
    fzf \
    zsh \
    man-db \
    unzip \
    gnupg2 \
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

# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

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

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV NPM_CONFIG_UNSAFE_PERM=true
ENV PATH=$PATH:/usr/local/share/npm-global/bin:/home/node/.local/bin

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
