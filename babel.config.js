module.exports = {
    "plugins": [
        "@babel/plugin-proposal-class-properties"
    ],
    "presets": [
        "@babel/preset-env",
        "@babel/preset-typescript",
        "@babel/preset-react"
    ],
    "env": {
        "es": {
            "presets": [["@babel/preset-env", { "modules": false }]]
        }
    }
};
