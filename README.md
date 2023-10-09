# Development

0. Pre-reqs

You need yarn.
You need node (v12 or greater)

1. Clone the repository and setup necessary files
    ```
    git clone https://github.com/silcam/lessons-from-luke.git
    cd lessons-from-luke
    yarn install
    mkdir strings
    mkdir strings/src
    mkdir strings/translations
    echo "[]" > strings/projects.json
    echo "[]" > strings/sources.json
    cp src/server/util/sampleSecrets.ts src/server/util/secrets.ts
    ```

2. Compile the TypeScript and start the server.
    ```
    yarn dev-web
    ```

    if you want the desktop client, run this (must also have run dev-web):

    ```
    yarn dev-desktop
    ```

# Test

`yarn test` or
`yarn test-watch`
