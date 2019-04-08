# Development

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
    cp src/util/sampleSecrets.ts src/util/secrets.ts
    ```
2. Compile the TypeScript and start the server.
    ```
    yarn watch
    ```

# Test

`yarn test` or
`yarn test-watch`