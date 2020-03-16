/* globals global Request*/
/* eslint no-undef: "error" */
import * as THREE from "three";
global.THREE = THREE;

import { WEBGL } from "three/examples/jsm/WebGL.js";
import {
    WebGLRendererParameters,
    LineSegments,
    BufferAttribute,
    VertexColors,
    LineBasicMaterial,
    BufferGeometry,
    CatmullRomCurve3,
    Box3,
    Box3Helper,
    TubeBufferGeometry,
    LineCurve3,
    Color,
    MeshBasicMaterial,
    SphereBufferGeometry,
    Vector2,
    Scene,
    PerspectiveCamera,
    DirectionalLight,
    HemisphereLight,
    WebGLRenderer,
    MeshLambertMaterial,
    Mesh,
    Vector3,
} from "three";

import "./three/OBJLoader.js";
import "./three/OrbitControls.js";

import jsLogger from "js-logger";

import MembraneShader from "./rendering/MembraneShader.js";

const MAX_PATH_LEN = 32;
const MAX_MESHES = 5000;
const BACKGROUND_COLOR = new Color(0xffffff);
const PATH_END_COLOR = BACKGROUND_COLOR;
const DEFAULT_VOLUME_BOUNDS = [-150, -150, -150, 150, 150, 150];
const BOUNDING_BOX_COLOR = new Color(0x6e6e6e);

function lerp(x0, x1, alpha) {
    return x0 + (x1 - x0) * alpha;
}

interface PathData {
    agent: number;
    numSegments: number;
    maxSegments: number;
    color: Color;
    points: Float32Array;
    colors: Float32Array;
    geometry: BufferGeometry;
    material: LineBasicMaterial;
    line: any;
}

class VisGeometry {
    public handleTrajectoryData: any;
    public visGeomMap: any;
    public meshRegistry: Map<any, any>;
    public meshLoadAttempted: Map<any, any>;
    public scaleMapping: Map<any, any>;
    public geomCount: number;
    public materials: any;
    public desatMaterials: any;
    public highlightMaterial: any;
    public followObject: any;
    public runTimeMeshes: any;
    public runTimeFiberMeshes: any;
    public mlastNumberOfAgents: number;
    public colorVariant: number;
    public fixLightsToCamera: boolean;
    public highlightedId: any;
    public paths: any;
    public sphereGeometry: any;
    public membrane: any;
    public mlogger: any;
    public renderer: any;
    public scene: any;
    public camera: any;
    public controls: any;
    public dl: any;
    public boundingBox: any;
    public boundingBoxMesh: any;
    public loadObj: any;
    public hemiLight: any;

    public constructor(loggerLevel) {
        this.handleTrajectoryData = trajectoryData => {
            this.updateBoxSize(trajectoryData);
        };

        this.visGeomMap = new Map();
        this.meshRegistry = new Map();
        this.meshLoadAttempted = new Map();
        this.scaleMapping = new Map();
        this.geomCount = MAX_MESHES;
        this.materials = [];
        this.desatMaterials = [];
        this.highlightMaterial = new MeshBasicMaterial({
            color: new Color(1, 0, 0),
        });
        this.followObject = null;
        this.runTimeMeshes = [];
        this.runTimeFiberMeshes = new Map();
        this.mlastNumberOfAgents = 0;
        this.colorVariant = 50;
        this.fixLightsToCamera = true;
        this.highlightedId = -1;

        // will store data for all agents that are drawing paths
        this.paths = [];

        // the canonical default geometry instance
        this.sphereGeometry = new SphereBufferGeometry(1, 32, 32);

        this.membrane = {
            // assume only one membrane mesh
            mesh: null,
            sim: MembraneShader.MembraneShaderSim
                ? new MembraneShader.MembraneShaderSim()
                : null,
            material: null,
            runtimeMeshIndex: -1,
            faces: [{ name: "curved_5nm_Right" }, { name: "curved_5nm_Left" }],
            sides: [
                { name: "curved_5nm_Bottom" },
                { name: "curved_5nm_Top" },
                { name: "curved_5nm_Back" },
                { name: "curved_5nm_Front" },
            ],
            facesMaterial: MembraneShader.MembraneShader.clone(),
            sidesMaterial: MembraneShader.MembraneShader.clone(),
        };
        this.membrane.facesMaterial.uniforms.uvscale.value = new Vector2(
            40.0,
            40.0
        );
        this.membrane.sidesMaterial.uniforms.uvscale.value = new Vector2(
            2.0,
            40.0
        );

        this.mlogger = jsLogger.get("visgeometry");
        this.mlogger.setLevel(loggerLevel);
    }

    public get logger() {
        return this.mlogger;
    }

    public get lastNumberOfAgents() {
        return this.mlastNumberOfAgents;
    }

    public set lastNumberOfAgents(val) {
        this.mlastNumberOfAgents = val;
    }

    public get renderDom() {
        return this.renderer.domElement;
    }

    public updateBoxSize(trajectoryData) {
        // get bounds.
        if (
            trajectoryData.hasOwnProperty("boxSizeX") &&
            trajectoryData.hasOwnProperty("boxSizeY") &&
            trajectoryData.hasOwnProperty("boxSizeZ")
        ) {
            const bx = trajectoryData.boxSizeX;
            const by = trajectoryData.boxSizeY;
            const bz = trajectoryData.boxSizeZ;
            const epsilon = 0.000001;
            if (
                Math.abs(bx) < epsilon ||
                Math.abs(by) < epsilon ||
                Math.abs(bz) < epsilon
            ) {
                console.log(
                    "WARNING: Bounding box: at least one bound is zero; using default bounds"
                );
                this.resetBounds(DEFAULT_VOLUME_BOUNDS);
            } else {
                this.resetBounds([
                    -bx / 2,
                    -by / 2,
                    -bz / 2,
                    bx / 2,
                    by / 2,
                    bz / 2,
                ]);
            }
        } else {
            this.resetBounds(DEFAULT_VOLUME_BOUNDS);
        }
    }

    public resetCamera() {
        this.controls.reset();
    }

    public getFollowObject() {
        return this.followObject;
    }

    public setFollowObject(obj) {
        if (
            obj &&
            obj.userData &&
            obj.userData.index === this.membrane.runtimeMeshIndex
        ) {
            return;
        }
        if (this.followObject) {
            this.assignMaterial(
                this.followObject,
                this.followObject.userData.baseMaterial
            );
        }
        this.followObject = obj;
        // put the camera on it
        if (obj) {
            this.controls.target.copy(obj.position);
            this.assignMaterial(obj, this.highlightMaterial);
        }
    }

    // equivalent to setFollowObject(null)
    public unfollow() {
        this.followObject = null;
    }

    public setHighlightById(id) {
        if (this.highlightedId === id) {
            return;
        }
        this.highlightedId = id;

        // go over all objects and update material
        let nMeshes = this.runTimeMeshes.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            const runtimeMesh = this.getMesh(i);
            if (runtimeMesh.userData && runtimeMesh.userData.active) {
                runtimeMesh.userData.baseMaterial = this.getMaterial(
                    runtimeMesh.userData.materialType,
                    runtimeMesh.userData.typeId
                );
                this.assignMaterial(
                    runtimeMesh,
                    runtimeMesh.userData.baseMaterial
                );
            }
        }
    }

    public dehighlight() {
        this.setHighlightById(-1);
    }

    public onNewRuntimeGeometryType(meshName) {
        // find all typeIds for this meshName
        let typeIds = [...this.visGeomMap.entries()]
            .filter(({ 1: v }) => v === meshName)
            .map(([k]) => k);

        // assuming the meshGeom has already been added to the registry
        const meshGeom = this.meshRegistry.get(meshName);

        // go over all objects and update mesh of this typeId
        // if this happens before the first updateScene, then the runtimeMeshes don't have type id's yet.
        let nMeshes = this.runTimeMeshes.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            let runtimeMesh = this.getMesh(i);
            if (
                runtimeMesh.userData &&
                typeIds.includes(runtimeMesh.userData.typeId)
            ) {
                const isFollowedObject = runtimeMesh === this.followObject;

                runtimeMesh = this.setupMeshGeometry(
                    i,
                    runtimeMesh,
                    meshGeom,
                    isFollowedObject
                );
            }
        }
    }

    public setUpControls(element) {
        this.controls = new THREE.OrbitControls(this.camera, element);
        this.controls.maxDistance = 750;
        this.controls.minDistance = 5;
        this.controls.zoomSpeed = 2;
        this.controls.enablePan = false;
    }

    /**
     *   Setup ThreeJS Scene
     * */
    public setupScene() {
        let initWidth = 100;
        let initHeight = 100;
        this.scene = new Scene();
        this.camera = new PerspectiveCamera(
            75,
            initWidth / initHeight,
            0.1,
            10000
        );

        this.resetBounds(DEFAULT_VOLUME_BOUNDS);

        this.dl = null;
        this.dl = new DirectionalLight(0xffffff, 0.6);
        this.dl.position.set(0, 0, 1);
        this.scene.add(this.dl);

        this.hemiLight = new HemisphereLight(0xffffff, 0x000000, 0.5);
        this.hemiLight.color.setHSL(0.095, 1, 0.75);
        this.hemiLight.groundColor.setHSL(0.6, 1, 0.6);
        this.hemiLight.position.set(0, 1, 0);
        this.scene.add(this.hemiLight);

        if (WEBGL.isWebGL2Available() === false) {
            this.renderer = new WebGLRenderer();
        } else {
            const canvas = document.createElement("canvas");
            const context: WebGLRenderingContext = (canvas.getContext(
                "webgl2",
                { alpha: false }
            ) as any) as WebGLRenderingContext;

            const rendererParams: WebGLRendererParameters = {
                canvas: canvas,
                context: context,
            };
            this.renderer = new WebGLRenderer(rendererParams);
        }

        this.renderer.setSize(initWidth, initHeight); // expected to change when reparented
        this.renderer.setClearColor(BACKGROUND_COLOR, 1);
        this.renderer.clear();

        this.camera.position.z = 120;

        this.loadObj = meshName => {
            const objLoader = new THREE.OBJLoader();
            objLoader.load(
                `https://aics-agentviz-data.s3.us-east-2.amazonaws.com/meshes/obj/${meshName}`,
                object => {
                    this.logger.debug("Finished loading mesh: ", meshName);
                    this.addMesh(meshName, object);
                    this.onNewRuntimeGeometryType(meshName);
                },
                xhr => {
                    this.logger.debug(
                        meshName,
                        " ",
                        `${(xhr.loaded / xhr.total) * 100}% loaded`
                    );
                },
                error => {
                    this.logger.debug("Failed to load mesh: ", error, meshName);
                }
            );
        };
    }

    public resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        if (this.membrane.sim) {
            this.membrane.sim.resize(width, height);
        }
    }

    public reparent(parent) {
        if (parent === "undefined" || parent == null) {
            return;
        }

        let height = parent.scrollHeight;
        let width = parent.scrollWidth;
        parent.appendChild(this.renderer.domElement);
        this.setUpControls(this.renderer.domElement);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.renderer.clear();

        if (this.membrane.sim) {
            this.membrane.sim.resize(width, height);
        }

        this.renderer.domElement.position = "absolute";
        this.renderer.domElement.top = "0px";
        this.renderer.domElement.left = "0px";

        this.renderer.domElement.onmouseenter = () => this.enableControls();
        this.renderer.domElement.onmouseleave = () => this.disableControls();
    }

    public disableControls() {
        this.controls.enabled = false;
    }

    public enableControls() {
        this.controls.enabled = true;
    }

    public render(time) {
        if (this.runTimeMeshes.length == 0) {
            return;
        }

        var elapsedSeconds = time / 1000;

        if (this.membrane.sim) {
            this.membrane.sim.render(this.renderer, elapsedSeconds);
        }

        if (this.membrane.mesh) {
            this.membrane.facesMaterial.uniforms.iTime.value = elapsedSeconds;
            this.membrane.sidesMaterial.uniforms.iTime.value = elapsedSeconds;

            if (this.membrane.sim) {
                this.membrane.material.uniforms.iChannel0.value = this.membrane.sim.getOutputTarget().texture;
                this.membrane.material.uniforms.iChannelResolution0.value = new Vector2(
                    this.membrane.sim.getOutputTarget().width,
                    this.membrane.sim.getOutputTarget().height
                );
            }

            this.renderer.getDrawingBufferSize(
                this.membrane.facesMaterial.uniforms.iResolution.value
            );
            this.renderer.getDrawingBufferSize(
                this.membrane.sidesMaterial.uniforms.iResolution.value
            );
        }

        this.controls.update();

        if (this.dl && this.fixLightsToCamera) {
            // position directional light at camera (facing scene, as headlight!)
            this.dl.position.setFromMatrixColumn(this.camera.matrixWorld, 2);

            //this.dl.position.copy(this.camera.position);
        }
        if (this.hemiLight && this.fixLightsToCamera) {
            // make hemi light come down from vertical of screen (camera up)
            this.hemiLight.position.setFromMatrixColumn(
                this.camera.matrixWorld,
                1
            );
        }

        this.renderer.render(this.scene, this.camera);
    }

    /**
     *   Run Time Mesh functions
     */
    public createMaterials(colors) {
        const numColors = colors.length;
        for (let i = 0; i < numColors; i += 1) {
            this.materials.push(new MeshLambertMaterial({ color: colors[i] }));
            let hsl: any = {};
            const desatColor = new Color(colors[i]);
            hsl = desatColor.getHSL(hsl);
            desatColor.setHSL(hsl.h, 0.5 * hsl.s, hsl.l);
            this.desatMaterials.push(
                new MeshLambertMaterial({
                    color: desatColor,
                    opacity: 0.25,
                    transparent: true,
                })
            );
        }
    }

    public createMeshes() {
        const { scene } = this;
        this.geomCount = MAX_MESHES;
        const sphereGeom = this.getSphereGeom();
        const { materials } = this;

        for (let i = 0; i < this.geomCount; i += 1) {
            const runtimeMesh = new Mesh(sphereGeom, materials[0]);

            runtimeMesh.name = `Mesh_${i.toString()}`;
            runtimeMesh.visible = false;
            this.runTimeMeshes[i] = runtimeMesh;
            scene.add(runtimeMesh);

            const fibercurve = new LineCurve3(
                new Vector3(0, 0, 0),
                new Vector3(1, 1, 1)
            );
            const geometry = new TubeBufferGeometry(fibercurve, 1, 1, 1, false);
            const runtimeFiberMesh = new Mesh(geometry, materials[0]);
            runtimeFiberMesh.name = `Fiber_${i.toString()}`;
            runtimeFiberMesh.visible = false;
            this.runTimeFiberMeshes.set(
                runtimeFiberMesh.name,
                runtimeFiberMesh
            );
            scene.add(runtimeFiberMesh);

            const runtimeFiberEndcapMesh0 = new Mesh(sphereGeom, materials[0]);
            runtimeFiberEndcapMesh0.name = `FiberEnd0_${i.toString()}`;
            runtimeFiberEndcapMesh0.visible = false;
            this.runTimeFiberMeshes.set(
                runtimeFiberEndcapMesh0.name,
                runtimeFiberEndcapMesh0
            );
            scene.add(runtimeFiberEndcapMesh0);

            const runtimeFiberEndcapMesh1 = new Mesh(sphereGeom, materials[0]);
            runtimeFiberEndcapMesh1.name = `FiberEnd1_${i.toString()}`;
            runtimeFiberEndcapMesh1.visible = false;
            this.runTimeFiberMeshes.set(
                runtimeFiberEndcapMesh1.name,
                runtimeFiberEndcapMesh1
            );
            scene.add(runtimeFiberEndcapMesh1);
        }
    }

    public addMesh(meshName, mesh) {
        this.meshRegistry.set(meshName, mesh);
        if (!mesh.name) {
            mesh.name = meshName;
        }
        if (meshName.includes("membrane")) {
            this.membrane.mesh = mesh;
            this.assignMembraneMaterial(mesh);
        }
    }

    public getMesh(index) {
        return this.runTimeMeshes[index];
    }

    public resetMesh(index, obj) {
        this.runTimeMeshes[index] = obj;
    }

    public getFiberMesh(name) {
        return this.runTimeFiberMeshes.get(name);
    }

    public getMaterial(index, typeId) {
        // if no highlight, or if this is the highlighed type, then use regular material, otherwise use desaturated.
        // todo strings or numbers for these ids?????
        const isHighlighted =
            this.highlightedId == -1 || this.highlightedId == typeId;

        // membrane is special
        if (typeId === this.membrane.typeId) {
            return isHighlighted
                ? this.membrane.facesMaterial
                : this.desatMaterials[0];
        }

        let matArray = isHighlighted ? this.materials : this.desatMaterials;
        return matArray[Number(index) % matArray.length];
    }

    /**
     *   Data Management
     */
    public resetMapping() {
        this.resetAllGeometry();

        this.visGeomMap.clear();
        this.meshRegistry.clear();
        this.meshLoadAttempted.clear();
        this.scaleMapping.clear();
    }

    /**
     *   Map Type ID -> Geometry
     */
    public mapIdToGeom(id, meshName) {
        this.logger.debug("Mesh for id ", id, " set to ", meshName);
        this.visGeomMap.set(id, meshName);
        if (meshName.includes("membrane")) {
            this.membrane.typeId = id;
        }

        if (
            meshName &&
            !this.meshRegistry.has(meshName) &&
            !this.meshLoadAttempted.get(meshName)
        ) {
            this.loadObj(meshName);
            this.meshLoadAttempted.set(meshName, true);
        }
    }

    public getGeomFromId(id) {
        if (this.visGeomMap.has(id)) {
            const meshName = this.visGeomMap.get(id);
            return this.meshRegistry.get(meshName);
        }

        return null;
    }

    public mapFromJSON(name, filePath, callback) {
        const jsonRequest = new Request(filePath);
        const self = this;
        return fetch(jsonRequest)
            .then(response => response.json())
            .then(data => {
                self.resetMapping();
                const jsonData = data;
                self.logger.debug("JSON Mesh mapping loaded: ", jsonData);
                Object.keys(jsonData).forEach(id => {
                    const entry = jsonData[id];
                    if (id === "size") {
                        console.log(
                            "WARNING: Ignoring deprecated bounding box data"
                        );
                    } else {
                        self.mapIdToGeom(Number(id), entry.mesh);
                        self.setScaleForId(Number(id), entry.scale);
                    }
                });
                if (callback) {
                    callback(jsonData);
                }
            });
    }

    public resetBounds(boundsAsArray) {
        if (!boundsAsArray) {
            console.log("invalid bounds received");
            return;
        }
        const visible = this.boundingBoxMesh
            ? this.boundingBoxMesh.visible
            : true;
        this.scene.remove(this.boundingBoxMesh);
        // array is minx,miny,minz, maxx,maxy,maxz
        this.boundingBox = new Box3(
            new Vector3(boundsAsArray[0], boundsAsArray[1], boundsAsArray[2]),
            new Vector3(boundsAsArray[3], boundsAsArray[4], boundsAsArray[5])
        );
        this.boundingBoxMesh = new Box3Helper(
            this.boundingBox,
            BOUNDING_BOX_COLOR
        );
        this.boundingBoxMesh.visible = visible;
        this.scene.add(this.boundingBoxMesh);
    }

    public setScaleForId(id, scale) {
        this.logger.debug("Scale for id ", id, " set to ", scale);
        this.scaleMapping.set(id, scale);
    }

    public getScaleForId(id) {
        if (this.scaleMapping.has(id)) {
            return this.scaleMapping.get(id);
        }

        return 1;
    }

    /**
     *   Default Geometry
     */
    public getSphereGeom() {
        const sphereId = -1;
        if (!this.meshRegistry.has(sphereId)) {
            this.meshRegistry.set(sphereId, this.sphereGeometry);
        }

        return this.meshRegistry.get(sphereId);
    }

    /**
     *   Update Scene
     * */
    public updateScene(agents) {
        const sphereGeometry = this.getSphereGeom();
        let fiberIndex = 0;

        // these have been set to correspond to backend values
        const visTypes = Object.freeze({
            ID_VIS_TYPE_DEFAULT: 1000,
            ID_VIS_TYPE_FIBER: 1001,
        });

        let dx, dy, dz;
        // The agents sent over are mapped by an integer id
        agents.forEach((agentData, i) => {
            const visType = agentData["vis-type"];
            const typeId = agentData.type;
            const scale = this.getScaleForId(typeId);

            if (visType === visTypes.ID_VIS_TYPE_DEFAULT) {
                const materialType = (typeId + 1) * this.colorVariant;
                let runtimeMesh = this.getMesh(i);
                const isFollowedObject = runtimeMesh === this.followObject;

                const lastTypeId = runtimeMesh.userData
                    ? runtimeMesh.userData.typeId
                    : -1;
                if (!runtimeMesh.userData) {
                    runtimeMesh.userData = {
                        active: true,
                        baseMaterial: this.getMaterial(materialType, typeId),
                        index: i,
                        typeId: typeId,
                        materialType: materialType,
                    };
                } else {
                    runtimeMesh.userData.active = true;
                    runtimeMesh.userData.baseMaterial = this.getMaterial(
                        materialType,
                        typeId
                    );
                    runtimeMesh.userData.index = i;
                    runtimeMesh.userData.typeId = typeId;
                    runtimeMesh.userData.materialType = materialType;
                }

                if (
                    runtimeMesh.geometry === sphereGeometry ||
                    typeId !== lastTypeId
                ) {
                    const meshGeom = this.getGeomFromId(typeId);
                    if (meshGeom && meshGeom.children) {
                        runtimeMesh = this.setupMeshGeometry(
                            i,
                            runtimeMesh,
                            meshGeom,
                            isFollowedObject
                        );
                    } else {
                        this.assignMaterial(
                            runtimeMesh,
                            runtimeMesh.userData.baseMaterial
                        );
                    }
                }

                dx = agentData.x - runtimeMesh.position.x;
                dy = agentData.y - runtimeMesh.position.y;
                dz = agentData.z - runtimeMesh.position.z;
                runtimeMesh.position.x = agentData.x;
                runtimeMesh.position.y = agentData.y;
                runtimeMesh.position.z = agentData.z;

                runtimeMesh.rotation.x = agentData.xrot;
                runtimeMesh.rotation.y = agentData.yrot;
                runtimeMesh.rotation.z = agentData.zrot;

                runtimeMesh.visible = true;

                runtimeMesh.scale.x = agentData.cr * scale;
                runtimeMesh.scale.y = agentData.cr * scale;
                runtimeMesh.scale.z = agentData.cr * scale;

                const path = this.findPathForAgentIndex(i);
                if (path) {
                    this.addPointToPath(
                        path,
                        agentData.x,
                        agentData.y,
                        agentData.z,
                        dx,
                        dy,
                        dz
                    );
                }
            } else if (visType === visTypes.ID_VIS_TYPE_FIBER) {
                const name = `Fiber_${fiberIndex.toString()}`;

                const runtimeFiberMesh = this.getFiberMesh(name);

                const curvePoints: any = [];
                const { subpoints } = agentData;
                const numSubPoints = subpoints.length;
                if (numSubPoints % 3 !== 0) {
                    this.logger.warn(
                        "Warning, subpoints array does not contain a multiple of 3"
                    );
                    this.logger.warn(agentData);
                    return;
                }
                const collisionRadius = agentData.cr;
                for (let j = 0; j < numSubPoints; j += 3) {
                    const x = subpoints[j];
                    const y = subpoints[j + 1];
                    const z = subpoints[j + 2];
                    curvePoints.push(new Vector3(x, y, z));
                }
                const fibercurve = new CatmullRomCurve3(curvePoints);
                const fibergeometry = new TubeBufferGeometry(
                    fibercurve,
                    (4 * numSubPoints) / 3,
                    collisionRadius * scale * 0.5,
                    8,
                    false
                );
                runtimeFiberMesh.geometry.copy(fibergeometry);
                runtimeFiberMesh.geometry.needsUpdate = true;
                runtimeFiberMesh.visible = true;

                const nameEnd0 = `FiberEnd0_${fiberIndex.toString()}`;
                const runtimeFiberEncapMesh0 = this.getFiberMesh(nameEnd0);
                runtimeFiberEncapMesh0.position.x = curvePoints[0].x;
                runtimeFiberEncapMesh0.position.y = curvePoints[0].y;
                runtimeFiberEncapMesh0.position.z = curvePoints[0].z;
                runtimeFiberEncapMesh0.scale.x = collisionRadius * scale * 0.5;
                runtimeFiberEncapMesh0.scale.y = collisionRadius * scale * 0.5;
                runtimeFiberEncapMesh0.scale.z = collisionRadius * scale * 0.5;
                runtimeFiberEncapMesh0.visible = true;
                const nameEnd1 = `FiberEnd1_${fiberIndex.toString()}`;
                const runtimeFiberEncapMesh1 = this.getFiberMesh(nameEnd1);
                runtimeFiberEncapMesh1.position.x =
                    curvePoints[curvePoints.length - 1].x;
                runtimeFiberEncapMesh1.position.y =
                    curvePoints[curvePoints.length - 1].y;
                runtimeFiberEncapMesh1.position.z =
                    curvePoints[curvePoints.length - 1].z;
                runtimeFiberEncapMesh1.scale.x = collisionRadius * scale * 0.5;
                runtimeFiberEncapMesh1.scale.y = collisionRadius * scale * 0.5;
                runtimeFiberEncapMesh1.scale.z = collisionRadius * scale * 0.5;
                runtimeFiberEncapMesh1.visible = true;

                fiberIndex += 1;
            }
        });

        this.hideUnusedFibers(fiberIndex);

        if (this.followObject) {
            // keep camera at same distance from target.
            const direction = new Vector3().subVectors(
                this.camera.position,
                this.controls.target
            );
            const distance = direction.length();

            // update controls target for orbiting
            this.controls.target.copy(this.followObject.position);

            direction.normalize();
            this.camera.position.subVectors(
                this.controls.target,
                direction.multiplyScalar(-distance)
            );
        }
    }

    public setupMeshGeometry(i, runtimeMesh, meshGeom, isFollowedObject) {
        // remember current transform
        const p = runtimeMesh.position;
        const r = runtimeMesh.rotation;
        const s = runtimeMesh.scale;

        if (this.membrane.mesh === meshGeom) {
            if (
                this.membrane.mesh &&
                runtimeMesh.children.length !==
                    this.membrane.mesh.children.length
            ) {
                // to avoid a deep clone of userData, just reuse the instance
                const userData = runtimeMesh.userData;
                const visible = runtimeMesh.visible;
                runtimeMesh.userData = null;
                this.scene.remove(runtimeMesh);
                runtimeMesh = this.membrane.mesh.clone();
                runtimeMesh.userData = userData;
                runtimeMesh.visible = visible;
                this.assignMembraneMaterial(runtimeMesh);
                this.scene.add(runtimeMesh);
                this.resetMesh(i, runtimeMesh);
                this.membrane.runtimeMeshIndex = i;
            }
        } else {
            // to avoid a deep clone of userData, just reuse the instance
            const userData = runtimeMesh.userData;
            const visible = runtimeMesh.visible;
            runtimeMesh.userData = null;
            this.scene.remove(runtimeMesh);
            runtimeMesh = meshGeom.clone();
            runtimeMesh.userData = userData;
            runtimeMesh.visible = visible;
            this.scene.add(runtimeMesh);
            this.resetMesh(i, runtimeMesh);

            if (isFollowedObject) {
                this.assignMaterial(runtimeMesh, this.highlightMaterial);
            } else {
                this.assignMaterial(
                    runtimeMesh,
                    runtimeMesh.userData.baseMaterial
                );
            }
        }

        // restore transform
        runtimeMesh.position.copy(p);
        runtimeMesh.rotation.copy(r);
        runtimeMesh.scale.copy(s);

        return runtimeMesh;
    }

    public assignMaterial(runtimeMesh, material) {
        if (runtimeMesh.name.includes("membrane")) {
            return this.assignMembraneMaterial(runtimeMesh);
        }

        if (runtimeMesh instanceof Mesh) {
            runtimeMesh.material = material;
        } else {
            runtimeMesh.traverse(child => {
                if (child instanceof Mesh) {
                    child.material = material;
                }
            });
        }
    }

    public assignMembraneMaterial(runtimeMesh) {
        const isHighlighted =
            this.highlightedId == -1 ||
            this.highlightedId == runtimeMesh.userData.typeId;

        if (isHighlighted) {
            // at this time, assign separate material parameters to the faces and sides of the membrane
            const faceNames = this.membrane.faces.map(el => {
                return el.name;
            });
            const sideNames = this.membrane.sides.map(el => {
                return el.name;
            });
            runtimeMesh.traverse(child => {
                if (child instanceof Mesh) {
                    if (faceNames.includes(child.name)) {
                        child.material = this.membrane.facesMaterial;
                    } else if (sideNames.includes(child.name)) {
                        child.material = this.membrane.sidesMaterial;
                    }
                }
            });
        } else {
            runtimeMesh.traverse(child => {
                if (child instanceof Mesh) {
                    child.material = this.desatMaterials[0];
                }
            });
        }
    }

    public getMaterialOfAgentIndex(idx) {
        const runtimeMesh = this.getMesh(idx);
        if (runtimeMesh.userData) {
            return runtimeMesh.userData.baseMaterial;
        }
        return undefined;
    }

    public findPathForAgentIndex(idx) {
        return this.paths.find(path => {
            return path.agent === idx;
        });
    }

    public removePathForObject(obj) {
        if (obj && obj.userData && obj.userData.index !== undefined) {
            this.removePathForAgentIndex(obj.userData.index);
        }
    }

    public addPathForObject(obj) {
        if (obj && obj.userData && obj.userData.index !== undefined) {
            this.addPathForAgentIndex(obj.userData.index);
        }
    }

    // assumes color is a threejs color, or null/undefined
    public addPathForAgentIndex(idx, maxSegments?: number, color?: any) {
        // make sure the idx is not already in our list.
        // could be optimized...
        const foundpath = this.findPathForAgentIndex(idx);
        if (foundpath) {
            foundpath.line.visible = true;
            return foundpath;
        }

        if (!maxSegments) {
            maxSegments = MAX_PATH_LEN;
        }

        if (!color) {
            // get the agent's color. is there a simpler way?
            const mat = this.getMaterialOfAgentIndex(idx);
            color = mat && mat.color ? mat.color.clone() : new Color(0xffffff);
        }

        const pathdata: PathData = {
            agent: idx,
            numSegments: 0,
            maxSegments: maxSegments,
            color: color,
            points: new Float32Array(maxSegments * 3 * 2),
            colors: new Float32Array(maxSegments * 3 * 2),
            geometry: new BufferGeometry(),
            material: new LineBasicMaterial({
                // the line will be colored per-vertex
                vertexColors: VertexColors,
            }),
            // will create line "lazily" when the line has more than 1 point(?)
            line: null,
        };

        pathdata.geometry.addAttribute(
            "position",
            new BufferAttribute(pathdata.points, 3)
        );
        pathdata.geometry.addAttribute(
            "color",
            new BufferAttribute(pathdata.colors, 3)
        );
        // path starts empty: draw range spans nothing
        pathdata.geometry.setDrawRange(0, 0);
        pathdata.line = new LineSegments(pathdata.geometry, pathdata.material);
        pathdata.line.frustumCulled = false;
        this.scene.add(pathdata.line);

        this.paths.push(pathdata);
        return pathdata;
    }

    public removePathForAgentIndex(idx) {
        const pathindex = this.paths.findIndex(path => {
            return path.agent === idx;
        });
        if (pathindex === -1) {
            console.log(
                "attempted to remove path for agent " +
                    idx +
                    " that doesn't exist."
            );
            return;
        }
        const path = this.paths[pathindex];
        this.scene.remove(path.line);

        this.paths.splice(pathindex, 1);
    }

    public addPointToPath(path, x, y, z, dx, dy, dz) {
        if (x === dx && y === dy && z === dz) {
            return;
        }
        // Check for periodic boundary condition:
        // if any agent moved more than half the volume size in one step,
        // assume it jumped the boundary going the other way.
        const volumeSize = new Vector3();
        this.boundingBox.getSize(volumeSize);
        if (
            Math.abs(dx) > volumeSize.x / 2 ||
            Math.abs(dy) > volumeSize.y / 2 ||
            Math.abs(dz) > volumeSize.z / 2
        ) {
            // now what?
            // TODO: clip line segment from x-dx to x against the bounds,
            // compute new line segments from x-dx to bound, and from x to opposite bound
            // For now, add a degenerate line segment
            dx = 0;
            dy = 0;
            dz = 0;
        }

        // check for paths at max length
        if (path.numSegments === path.maxSegments) {
            // because we append to the end, we can copyWithin to move points up to the beginning
            // as a means of removing the first point in the path.
            // shift the points:
            path.points.copyWithin(0, 3 * 2, path.maxSegments * 3 * 2);
            path.numSegments = path.maxSegments - 1;
        } else {
            // rewrite all the colors. this might be prohibitive for lots of long paths.
            for (let ic = 0; ic < path.numSegments + 1; ++ic) {
                // the very first point should be a=1
                const a = 1.0 - ic / (path.numSegments + 1);
                path.colors[ic * 6 + 0] = lerp(
                    path.color.r,
                    PATH_END_COLOR.r,
                    a
                );
                path.colors[ic * 6 + 1] = lerp(
                    path.color.g,
                    PATH_END_COLOR.g,
                    a
                );
                path.colors[ic * 6 + 2] = lerp(
                    path.color.b,
                    PATH_END_COLOR.b,
                    a
                );

                // the very last point should be b=0
                const b = 1.0 - (ic + 1) / (path.numSegments + 1);
                path.colors[ic * 6 + 3] = lerp(
                    path.color.r,
                    PATH_END_COLOR.r,
                    b
                );
                path.colors[ic * 6 + 4] = lerp(
                    path.color.g,
                    PATH_END_COLOR.g,
                    b
                );
                path.colors[ic * 6 + 5] = lerp(
                    path.color.b,
                    PATH_END_COLOR.b,
                    b
                );
            }
            path.line.geometry.attributes.color.needsUpdate = true;
        }
        // add a segment to this line
        path.points[path.numSegments * 2 * 3 + 0] = x - dx;
        path.points[path.numSegments * 2 * 3 + 1] = y - dy;
        path.points[path.numSegments * 2 * 3 + 2] = z - dz;
        path.points[path.numSegments * 2 * 3 + 3] = x;
        path.points[path.numSegments * 2 * 3 + 4] = y;
        path.points[path.numSegments * 2 * 3 + 5] = z;

        path.numSegments++;

        path.line.geometry.setDrawRange(0, path.numSegments * 2);
        path.line.geometry.attributes.position.needsUpdate = true; // required after the first render
    }

    public setShowPaths(showPaths) {
        for (let i = 0; i < this.paths.length; ++i) {
            this.paths[i].line.visible = showPaths;
        }
    }

    public setShowMeshes(showMeshes) {
        let nMeshes = this.runTimeMeshes.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            const runtimeMesh = this.getMesh(i);
            if (runtimeMesh.userData && runtimeMesh.userData.active) {
                runtimeMesh.visible = showMeshes;
            }
        }
    }

    public setShowBounds(showBounds) {
        this.boundingBoxMesh.visible = showBounds;
    }

    public showPathForAgentIndex(idx, visible) {
        const path = this.findPathForAgentIndex(idx);
        if (path) {
            path.line.visible = visible;
        }
    }

    public hideUnusedMeshes(numberOfAgents) {
        let nMeshes = this.runTimeMeshes.length;
        for (let i = numberOfAgents; i < MAX_MESHES && i < nMeshes; i += 1) {
            const runtimeMesh = this.getMesh(i);
            if (runtimeMesh.visible === false) {
                break;
            }

            runtimeMesh.visible = false;
            if (runtimeMesh.userData) {
                runtimeMesh.userData.active = false;
            }

            // hide the path if we're hiding the agent. should we remove the path here?
            this.showPathForAgentIndex(i, false);
        }
    }

    public hideUnusedFibers(numberOfFibers) {
        for (let i = numberOfFibers; i < MAX_MESHES; i += 1) {
            const name = `Fiber_${i.toString()}`;
            const fiberMesh = this.getFiberMesh(name);

            if (fiberMesh.visible === false) {
                break;
            }

            const nameEnd0 = `FiberEnd0_${i.toString()}`;
            const end0 = this.getFiberMesh(nameEnd0);

            const nameEnd1 = `FiberEnd1_${i.toString()}`;
            const end1 = this.getFiberMesh(nameEnd1);

            fiberMesh.visible = false;
            end0.visible = false;
            end1.visible = false;
        }
    }

    public clear() {
        this.hideUnusedMeshes(0);
        this.hideUnusedFibers(0);
    }

    public resetAllGeometry() {
        // set all runtime meshes back to spheres.
        const sphereGeom = this.getSphereGeom();
        let nMeshes = this.runTimeMeshes.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            if (this.runTimeMeshes[i].userData) {
                const runtimeMesh = this.setupMeshGeometry(
                    i,
                    this.runTimeMeshes[i],
                    new Mesh(sphereGeom),
                    false
                );
                this.assignMaterial(
                    runtimeMesh,
                    new MeshLambertMaterial({ color: 0xff00ff })
                );
            }
        }
    }

    public update(agents) {
        this.updateScene(agents);

        const numberOfAgents = agents.length;
        if (this.lastNumberOfAgents > numberOfAgents) {
            this.hideUnusedMeshes(numberOfAgents);
        }
        this.lastNumberOfAgents = numberOfAgents;
    }
}

export { VisGeometry };
export default VisGeometry;
