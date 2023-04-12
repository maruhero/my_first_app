import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";

//configuration values
const config = new pulumi.Config();
const frontendPort = config.requireNumber("frontendPort");
const backendPort = config.requireNumber("backendPort");
const mongoPort = config.requireNumber("mongoPort");
const stack = pulumi.getStack();
const mongoHost = config.require("mongoHost");
const database = config.require("database");
const nodeEnvironment = config.require("nodeEnvironment");
const protocol = config.require("protocol")
//all these configurations values are set as rrequired, meaning if you forget to set them with pulumi config set, then pulumi up will report an error

//pull backend image
const backendImageName = "backend";
const backend = new docker.RemoteImage(`${backendImageName}Image`, {
	//docker uses `name` argument to pull a remote image for us to use
	name: "pulumi/tutorial-pulumi-fundamentals-backend:latest",
});


//pull frontend image
const frontendImageName = "frontend";
const frontend = new docker.RemoteImage(`${frontendImageName}Image`, {
	name: "pulumi/tutorial-pulumi-fundamentals-frontend:latest",
});

//pull mongoDB image
const mongoImage = new docker.RemoteImage("mongoImage", {
	name: "pulumi/tutorial-pulumi-fundamentals-database-local:latest"
});

//create docker network
const network = new docker.Network("network", {
	name: `services-${stack}`,
});

//create mongodb container
const mongoContainer = new docker.Container("mongoContainer", {
	image: mongoImage.repoDigest,
	name: `mongo-${stack}`,
	ports: [
		{
			internal: mongoPort,
			external: mongoPort,
		},
	],
	networksAdvanced: [
		{
			name: network.name,
			aliases: ["mongo"],
		},
	],
});

//create backend container
const backendContainer = new docker.Container("backendContainer", {
	name: `backend-${stack}`,
	//repoDigest, pulumi now knows there is a dependency between these two resources and will know to create the Container resource after the RemoteImage resources
	//another dependency to note is backendContainer depends on mongoContainer. if we try to run pulumi up w/o mongoContainer running or present somewhere in state, Pulumi would let us know that the resource didn't exist and would stop
	/*
	 it's important to note that backend container requires some environment variables to connect to Mongo container and set the Node environment for Express.js. we don't want to hardcode these values; we want them to be configurable, to do that.
pulumi config set mongoHost mongodb://mongo:27017
pulumi config set database cart
pulumi config set nodeEnvironment development
pulumi config set protocol http://
	 */
	image: backend.repoDigest,
	ports: [
		{
			internal: backendPort,
			external: backendPort,
		},
	],
	envs: [
		`DATABASE_HOST=${mongoHost}`,
			`DATABASE_NAME=${database}`,
			`NODE_ENV=${nodeEnvironment}`,
	],
		networksAdvanced: [
			{
				name: network.name
			},
		],
}, { dependsOn: [ mongoContainer ]});

//create frontend container
const frontendContainer = new docker.Container("frontendContainer", {
	image: frontend.repoDigest,
	name: `frontend-${stack}`,
	ports: [
		{
			internal: frontendPort,
			external: backendPort,
		},
	],
	envs: [
		`PORT=${frontendPort}`,
			`HTTP_PROXY=backend-${stack}:${backendPort}`,
			`PROXY_PROTOCOL=${protocol}`
	],
	networksAdvanced: [
		{
			name: network.name,
		},
	],
});

/* with docker networking, we can use image names to refer to a container. in this example, react frontend client sends requests to express backend client. URL to backend is set via setupProxy.js file in app/frontend/src directory with HTTP_PROXY env var
 */
