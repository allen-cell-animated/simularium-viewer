import { WEBGL } from "three/examples/jsm/WebGL.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import VisAgent from "./VisAgent";
import PDBModel from "./PDBModel";

import {
    Box3,
    Box3Helper,
    BufferAttribute,
    BufferGeometry,
    CatmullRomCurve3,
    Color,
    DirectionalLight,
    Group,
    HemisphereLight,
    LineBasicMaterial,
    LineCurve3,
    LineSegments,
    Mesh,
    MeshLambertMaterial,
    Object3D,
    PerspectiveCamera,
    Raycaster,
    Scene,
    TubeBufferGeometry,
    Vector2,
    Vector3,
    VertexColors,
    WebGLRenderer,
    WebGLRendererParameters,
} from "three";

import * as dat from "dat.gui";

import jsLogger from "js-logger";
import { ILogger } from "js-logger/src/types";

import { AgentData } from "./VisData";

import MoleculeRenderer from "./rendering/MoleculeRenderer";

const MAX_PATH_LEN = 32;
const MAX_MESHES = 20000;
const DEFAULT_BACKGROUND_COLOR = new Color(0.121569, 0.13333, 0.17647);
const DEFAULT_VOLUME_BOUNDS = [-150, -150, -150, 150, 150, 150];
const BOUNDING_BOX_COLOR = new Color(0x6e6e6e);
const NO_AGENT = -1;
const ASSET_URL_PREFIX =
    "https://aics-agentviz-data.s3.us-east-2.amazonaws.com/meshes/obj";

enum RenderStyle {
    GENERIC,
    MOLECULAR,
}

function lerp(x0: number, x1: number, alpha: number): number {
    return x0 + (x1 - x0) * alpha;
}

interface AgentTypeGeometry {
    meshName: string;
    pdbName: string;
}

interface HSL {
    h: number;
    s: number;
    l: number;
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
    line: LineSegments | null;
}

class VisGeometry {
    public renderStyle: RenderStyle;
    public backgroundColor: Color;
    public pathEndColor: Color;
    public visGeomMap: Map<number, AgentTypeGeometry>;
    public meshRegistry: Map<string | number, Mesh>;
    public pdbRegistry: Map<string | number, PDBModel>;
    public meshLoadAttempted: Map<string, boolean>;
    public pdbLoadAttempted: Map<string, boolean>;
    public scaleMapping: Map<number, number>;
    public geomCount: number;
    public followObjectIndex: number;
    public visAgents: VisAgent[];
    public runTimeFiberMeshes: Map<string, Mesh>;
    public mlastNumberOfAgents: number;
    public colorVariant: number;
    public fixLightsToCamera: boolean;
    public highlightedId: number;
    public paths: PathData[];
    public mlogger: ILogger;
    public renderer: WebGLRenderer;
    public scene: Scene;
    public camera: PerspectiveCamera;
    public controls: OrbitControls;
    public dl: DirectionalLight;
    public boundingBox: Box3;
    public boundingBoxMesh: Box3Helper;
    public hemiLight: HemisphereLight;
    public moleculeRenderer: MoleculeRenderer;
    public currentSceneAgents: AgentData[];
    public colorsData: Float32Array;
    public lightsGroup: Group;
    public agentMeshGroup: Group;
    public agentFiberGroup: Group;
    public agentPDBGroup: Group;
    public agentPathGroup: Group;
    private raycaster: Raycaster;
    private supportsMoleculeRendering: boolean;
    private membraneAgent?: VisAgent;
    private lodBias: number;

    private errorMesh: Mesh;

    public constructor(loggerLevel) {
        this.renderStyle = RenderStyle.GENERIC;
        this.supportsMoleculeRendering = false;

        this.visGeomMap = new Map<number, AgentTypeGeometry>();
        this.meshRegistry = new Map<string | number, Mesh>();
        this.pdbRegistry = new Map<string | number, PDBModel>();
        this.meshLoadAttempted = new Map<string, boolean>();
        this.pdbLoadAttempted = new Map<string, boolean>();
        this.scaleMapping = new Map<number, number>();
        this.geomCount = MAX_MESHES;
        this.followObjectIndex = NO_AGENT;
        this.visAgents = [];
        this.runTimeFiberMeshes = new Map();
        this.mlastNumberOfAgents = 0;
        this.colorVariant = 50;
        this.fixLightsToCamera = true;
        this.highlightedId = -1;
        this.lodBias = 0;

        // will store data for all agents that are drawing paths
        this.paths = [];

        this.setupScene();

        this.membraneAgent = undefined;

        this.moleculeRenderer = new MoleculeRenderer();

        this.backgroundColor = DEFAULT_BACKGROUND_COLOR;
        this.pathEndColor = this.backgroundColor.clone();
        this.moleculeRenderer.setBackgroundColor(this.backgroundColor);

        this.mlogger = jsLogger.get("visgeometry");
        this.mlogger.setLevel(loggerLevel);

        this.scene = new Scene();
        this.lightsGroup = new Group();
        this.agentMeshGroup = new Group();
        this.agentFiberGroup = new Group();
        this.agentPDBGroup = new Group();
        this.agentPathGroup = new Group();

        this.camera = new PerspectiveCamera(75, 100 / 100, 0.1, 10000);
        this.dl = new DirectionalLight(0xffffff, 0.6);
        this.hemiLight = new HemisphereLight(0xffffff, 0x000000, 0.5);
        this.renderer = new WebGLRenderer();
        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement
        );

        this.boundingBox = new Box3(
            new Vector3(0, 0, 0),
            new Vector3(100, 100, 100)
        );
        this.boundingBoxMesh = new Box3Helper(
            this.boundingBox,
            BOUNDING_BOX_COLOR
        );
        this.errorMesh = new Mesh(VisAgent.sphereGeometry);
        this.currentSceneAgents = [];
        this.colorsData = new Float32Array(0);
        if (loggerLevel === jsLogger.DEBUG) {
            this.setupGui();
        }
        this.raycaster = new Raycaster();
    }

    public setBackgroundColor(c): void {
        // convert from a PropColor to a THREE.Color
        this.backgroundColor = Array.isArray(c)
            ? new Color(c[0], c[1], c[2])
            : new Color(c);
        this.pathEndColor = this.backgroundColor.clone();
        this.moleculeRenderer.setBackgroundColor(this.backgroundColor);
        this.renderer.setClearColor(this.backgroundColor, 1);
    }

    public setupGui(): void {
        const gui = new dat.GUI();
        var settings = {
            bgcolor: {
                r: this.backgroundColor.r * 255,
                g: this.backgroundColor.g * 255,
                b: this.backgroundColor.b * 255,
            },
            lodBias: this.lodBias,
        };
        var self = this;
        gui.addColor(settings, "bgcolor").onChange(value => {
            self.setBackgroundColor([
                value.r / 255.0,
                value.g / 255.0,
                value.b / 255.0,
            ]);
        });
        gui.add(settings, "lodBias")
            .min(0)
            .max(3)
            .step(1)
            .onChange(value => {
                self.lodBias = value;
            });

        this.moleculeRenderer.setupGui(gui);
    }

    public switchRenderStyle(): void {
        // if target render style is supported, then change, otherwise don't.
        if (
            this.renderStyle === RenderStyle.GENERIC &&
            !this.supportsMoleculeRendering
        ) {
            console.log("Warning: molecule rendering not supported");
            return;
        }

        this.renderStyle =
            this.renderStyle === RenderStyle.GENERIC
                ? RenderStyle.MOLECULAR
                : RenderStyle.GENERIC;
        this.updateScene(this.currentSceneAgents);
    }

    public get logger(): ILogger {
        return this.mlogger;
    }

    public get lastNumberOfAgents(): number {
        return this.mlastNumberOfAgents;
    }

    public set lastNumberOfAgents(val) {
        this.mlastNumberOfAgents = val;
    }

    public get renderDom(): HTMLElement {
        return this.renderer.domElement;
    }

    public handleTrajectoryData(trajectoryData): void {
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

    public resetCamera(): void {
        this.controls.reset();
    }

    public getFollowObject(): number {
        return this.followObjectIndex;
    }

    public setFollowObject(obj: number): void {
        if (this.membraneAgent && obj === this.membraneAgent.agentIndex) {
            return;
        }

        if (this.followObjectIndex !== NO_AGENT) {
            const visAgent = this.visAgents[this.followObjectIndex];
            visAgent.setHighlighted(false);
        }
        this.followObjectIndex = obj;

        if (obj !== NO_AGENT) {
            const visAgent = this.visAgents[obj];
            visAgent.setHighlighted(true);
        }
    }

    // equivalent to setFollowObject(NO_AGENT)
    public unfollow(): void {
        this.followObjectIndex = NO_AGENT;
    }

    public setHighlightById(id): void {
        if (this.highlightedId === id) {
            return;
        }
        this.highlightedId = id;

        // go over all objects and update material
        const nMeshes = this.visAgents.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            const visAgent = this.visAgents[i];
            if (visAgent.active) {
                const isHighlighted =
                    this.highlightedId == -1 ||
                    this.highlightedId == visAgent.typeId;
                visAgent.setHighlighted(isHighlighted);
            }
        }
    }

    public dehighlight(): void {
        this.setHighlightById(-1);
    }

    public onNewRuntimeGeometryType(meshName): void {
        // find all typeIds for this meshName
        let typeIds = [...this.visGeomMap.entries()]
            .filter(({ 1: v }) => v.meshName === meshName)
            .map(([k]) => k);

        // assuming the meshGeom has already been added to the registry
        const meshGeom = this.meshRegistry.get(meshName);

        // go over all objects and update mesh of this typeId
        // if this happens before the first updateScene, then the visAgents don't have type id's yet.
        const nMeshes = this.visAgents.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            let visAgent = this.visAgents[i];
            if (typeIds.includes(visAgent.typeId)) {
                this.resetAgentMesh(visAgent, meshGeom);
                visAgent.setColor(
                    this.getColorForTypeId(visAgent.typeId),
                    this.getColorIndexForTypeId(visAgent.typeId)
                );
            }
        }
    }

    private resetAgentMesh(visAgent, meshGeom): void {
        this.agentMeshGroup.remove(visAgent.mesh);
        visAgent.setupMeshGeometry(meshGeom);
        this.agentMeshGroup.add(visAgent.mesh);
    }

    public onNewPdb(pdbName): void {
        // find all typeIds for this meshName
        let typeIds = [...this.visGeomMap.entries()]
            .filter(({ 1: v }) => v.pdbName === pdbName)
            .map(([k]) => k);

        // assuming the pdb has already been added to the registry
        const pdb = this.pdbRegistry.get(pdbName);

        // go over all objects and update mesh of this typeId
        // if this happens before the first updateScene, then the visAgents don't have type id's yet.
        const nMeshes = this.visAgents.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            let visAgent = this.visAgents[i];
            if (typeIds.includes(visAgent.typeId)) {
                this.resetAgentPDB(visAgent, pdb);
            }
        }
    }

    private resetAgentPDB(visAgent, pdb): void {
        this.agentPDBGroup.remove(visAgent.pdbObjects);
        visAgent.setupPdb(pdb);
        this.agentPDBGroup.add(visAgent.pdbObjects);
    }

    public setUpControls(element): void {
        this.controls = new OrbitControls(this.camera, element);
        this.controls.maxDistance = 750;
        this.controls.minDistance = 5;
        this.controls.zoomSpeed = 2;
        this.controls.enablePan = false;
    }

    /**
     *   Setup ThreeJS Scene
     * */
    public setupScene(): void {
        let initWidth = 100;
        let initHeight = 100;
        this.scene = new Scene();
        this.lightsGroup = new Group();
        this.lightsGroup.name = "lights";
        this.scene.add(this.lightsGroup);
        this.agentMeshGroup = new Group();
        this.agentMeshGroup.name = "agent meshes";
        this.scene.add(this.agentMeshGroup);
        this.agentFiberGroup = new Group();
        this.agentFiberGroup.name = "agent fibers";
        this.scene.add(this.agentFiberGroup);
        this.agentPDBGroup = new Group();
        this.agentPDBGroup.name = "agent pdbs";
        this.scene.add(this.agentPDBGroup);
        this.agentPathGroup = new Group();
        this.agentPathGroup.name = "agent paths";
        this.scene.add(this.agentPathGroup);

        this.camera = new PerspectiveCamera(
            75,
            initWidth / initHeight,
            0.1,
            1000
        );

        this.resetBounds(DEFAULT_VOLUME_BOUNDS);

        this.dl = new DirectionalLight(0xffffff, 0.6);
        this.dl.position.set(0, 0, 1);
        this.lightsGroup.add(this.dl);

        this.hemiLight = new HemisphereLight(0xffffff, 0x000000, 0.5);
        this.hemiLight.color.setHSL(0.095, 1, 0.75);
        this.hemiLight.groundColor.setHSL(0.6, 1, 0.6);
        this.hemiLight.position.set(0, 1, 0);
        this.lightsGroup.add(this.hemiLight);

        if (WEBGL.isWebGL2Available() === false) {
            this.renderStyle == RenderStyle.GENERIC;
            this.renderer = new WebGLRenderer();
        } else {
            // TODO: consider switching to molecule rendering by default here??

            this.supportsMoleculeRendering = true;
            const canvas = document.createElement("canvas");
            const context: WebGLRenderingContext = canvas.getContext("webgl2", {
                alpha: false,
            }) as WebGLRenderingContext;

            const rendererParams: WebGLRendererParameters = {
                canvas: canvas,
                context: context,
            };
            this.renderer = new WebGLRenderer(rendererParams);
        }

        this.renderer.setSize(initWidth, initHeight); // expected to change when reparented
        this.renderer.setClearColor(this.backgroundColor, 1);
        this.renderer.clear();

        this.camera.position.z = 120;
    }

    public loadPdb(pdbName): void {
        const pdbmodel = new PDBModel(pdbName);

        pdbmodel.download(`${ASSET_URL_PREFIX}/${pdbName}`).then(
            () => {
                this.logger.debug("Finished loading pdb: ", pdbName);
                this.pdbRegistry.set(pdbName, pdbmodel);
                this.onNewPdb(pdbName);
            },
            reason => {
                console.error(reason);
                this.logger.debug("Failed to load pdb: ", pdbName);
            }
        );
    }

    public loadObj(meshName): void {
        const objLoader = new OBJLoader();
        objLoader.load(
            `${ASSET_URL_PREFIX}/${meshName}`,
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
    }

    public resize(width, height): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.moleculeRenderer.resize(width, height);
    }

    public reparent(parent): void {
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

        this.moleculeRenderer.resize(width, height);

        this.renderer.setClearColor(this.backgroundColor, 1.0);
        this.renderer.clear();

        this.renderer.domElement.setAttribute("style", "top: 0px; left: 0px");

        this.renderer.domElement.onmouseenter = () => this.enableControls();
        this.renderer.domElement.onmouseleave = () => this.disableControls();
    }

    public disableControls(): void {
        this.controls.enabled = false;
    }

    public enableControls(): void {
        this.controls.enabled = true;
    }

    public render(time): void {
        if (this.visAgents.length == 0) {
            return;
        }

        var elapsedSeconds = time / 1000;

        if (this.membraneAgent) {
            VisAgent.updateMembrane(elapsedSeconds, this.renderer);
        }

        this.controls.update();

        this.animateCamera();

        // update light sources due to camera moves
        if (this.dl && this.fixLightsToCamera) {
            // position directional light at camera (facing scene, as headlight!)
            this.dl.position.setFromMatrixColumn(this.camera.matrixWorld, 2);
        }
        if (this.hemiLight && this.fixLightsToCamera) {
            // make hemi light come down from vertical of screen (camera up)
            this.hemiLight.position.setFromMatrixColumn(
                this.camera.matrixWorld,
                1
            );
        }

        if (this.renderStyle == RenderStyle.GENERIC) {
            // meshes only.
            this.renderer.render(this.scene, this.camera);
        } else {
            // select visibility and representation.
            // and set lod for pdbs.
            for (let i = 0; i < this.visAgents.length; ++i) {
                const agent = this.visAgents[i];
                if (agent.active) {
                    if (agent.hasDrawablePDB()) {
                        agent.mesh.visible = false;
                        // if it has any pdb objects then set up the LOD visibility.
                        const distances = [40, 100, 150, Number.MAX_VALUE];
                        const distance = this.camera.position.distanceTo(
                            agent.mesh.position
                        );
                        for (let j = 0; j < distances.length; ++j) {
                            // the first distance less than.
                            if (distance < distances[j]) {
                                // add lodBias but keep within range.
                                j = Math.min(
                                    j + this.lodBias,
                                    distances.length - 1
                                );
                                agent.selectLOD(j);
                                break;
                            }
                        }
                    } else {
                        agent.setPDBInvisible();
                        agent.mesh.visible = true;
                    }
                }
            }

            this.scene.updateMatrixWorld();
            this.scene.autoUpdate = false;
            this.moleculeRenderer.setMeshGroups(
                this.agentMeshGroup,
                this.agentPDBGroup,
                this.agentFiberGroup
            );
            this.moleculeRenderer.setHighlightInstance(this.followObjectIndex);
            this.boundingBoxMesh.visible = false;
            this.agentPathGroup.visible = false;
            this.moleculeRenderer.render(
                this.renderer,
                this.scene,
                this.camera,
                null
            );

            // final pass, add extra stuff on top: bounding box and line paths
            this.boundingBoxMesh.visible = true;
            this.agentPathGroup.visible = true;

            this.renderer.autoClear = false;
            // hide everything except the wireframe and paths, and render with the standard renderer
            this.agentMeshGroup.visible = false;
            this.agentFiberGroup.visible = false;
            this.agentPDBGroup.visible = false;
            this.renderer.render(this.scene, this.camera);
            this.agentMeshGroup.visible = true;
            this.agentFiberGroup.visible = true;
            this.agentPDBGroup.visible = true;
            this.renderer.autoClear = true;

            this.scene.autoUpdate = false;
        }
    }

    public hitTest(event: MouseEvent): number {
        const size = new Vector2();
        this.renderer.getSize(size);
        if (this.renderStyle === RenderStyle.GENERIC) {
            const mouse = {
                x: (event.offsetX / size.x) * 2 - 1,
                y: -(event.offsetY / size.y) * 2 + 1,
            };

            this.raycaster.setFromCamera(mouse, this.camera);
            // only intersect the agent mesh group.
            // TODO: intersect fibers also
            const intersects = this.raycaster.intersectObjects(
                this.agentMeshGroup.children,
                true
            );

            if (intersects && intersects.length) {
                let obj = intersects[0].object;
                // if the object has a parent and the parent is not the scene, use that.
                // assumption: obj file meshes load into their own Groups
                // and have only one level of hierarchy.
                if (!obj.userData || !obj.userData.index) {
                    if (obj.parent && obj.parent !== this.agentMeshGroup) {
                        obj = obj.parent;
                    }
                }
                return obj.userData.index;
            } else {
                return NO_AGENT;
            }
        } else {
            // read from instance buffer pixel!
            return this.moleculeRenderer.hitTest(
                this.renderer,
                event.offsetX,
                size.y - event.offsetY
            );
        }
    }

    /**
     *   Run Time Mesh functions
     */
    public createMaterials(colors): void {
        const numColors = colors.length;
        // fill buffer of colors:
        this.colorsData = new Float32Array(numColors * 4);
        for (let i = 0; i < numColors; i += 1) {
            // each color is currently a hex value:
            this.colorsData[i * 4 + 0] =
                ((colors[i] & 0x00ff0000) >> 16) / 255.0;
            this.colorsData[i * 4 + 1] =
                ((colors[i] & 0x0000ff00) >> 8) / 255.0;
            this.colorsData[i * 4 + 2] =
                ((colors[i] & 0x000000ff) >> 0) / 255.0;
            this.colorsData[i * 4 + 3] = 1.0;
        }
        this.moleculeRenderer.updateColors(numColors, this.colorsData);
    }

    private getColorIndexForTypeId(typeId): number {
        const index = (typeId + 1) * this.colorVariant;
        return index % (this.colorsData.length / 4);
    }

    private getColorForTypeId(typeId): Color {
        const index = this.getColorIndexForTypeId(typeId);
        return new Color(
            this.colorsData[index * 4],
            this.colorsData[index * 4 + 1],
            this.colorsData[index * 4 + 2]
        );
    }

    public createMeshes(): void {
        this.geomCount = MAX_MESHES;

        //multipass render:
        // draw moleculebuffer into several render targets to store depth, normals, colors
        // draw quad to composite the buffers into final frame

        // create placeholder meshes and fibers
        const mat = new MeshLambertMaterial({
            color: VisAgent.UNASSIGNED_MESH_COLOR,
        });
        for (let i = 0; i < this.geomCount; i += 1) {
            // 1. mesh geometries

            this.visAgents[i] = new VisAgent(`Mesh_${i.toString()}`);

            // 2. fibers

            const fibercurve = new LineCurve3(
                new Vector3(0, 0, 0),
                new Vector3(1, 1, 1)
            );
            const geometry = new TubeBufferGeometry(fibercurve, 1, 1, 1, false);
            const runtimeFiberMesh = new Mesh(geometry, mat);
            runtimeFiberMesh.name = `Fiber_${i.toString()}`;
            runtimeFiberMesh.visible = false;
            this.runTimeFiberMeshes.set(
                runtimeFiberMesh.name,
                runtimeFiberMesh
            );
            this.agentFiberGroup.add(runtimeFiberMesh);

            const runtimeFiberEndcapMesh0 = new Mesh(
                VisAgent.sphereGeometry,
                mat
            );
            runtimeFiberEndcapMesh0.name = `FiberEnd0_${i.toString()}`;
            runtimeFiberEndcapMesh0.visible = false;
            this.runTimeFiberMeshes.set(
                runtimeFiberEndcapMesh0.name,
                runtimeFiberEndcapMesh0
            );
            this.agentFiberGroup.add(runtimeFiberEndcapMesh0);

            const runtimeFiberEndcapMesh1 = new Mesh(
                VisAgent.sphereGeometry,
                mat
            );
            runtimeFiberEndcapMesh1.name = `FiberEnd1_${i.toString()}`;
            runtimeFiberEndcapMesh1.visible = false;
            this.runTimeFiberMeshes.set(
                runtimeFiberEndcapMesh1.name,
                runtimeFiberEndcapMesh1
            );
            this.agentFiberGroup.add(runtimeFiberEndcapMesh1);
        }
    }

    public addMesh(meshName, mesh): void {
        this.meshRegistry.set(meshName, mesh);

        if (!mesh.name) {
            mesh.name = meshName;
        }
    }

    public getFiberMesh(name: string): Mesh {
        let mesh = this.runTimeFiberMeshes.get(name);
        if (mesh) {
            mesh;
        }

        return this.errorMesh;
    }

    /**
     *   Data Management
     */
    public resetMapping(): void {
        this.resetAllGeometry();

        this.visGeomMap.clear();
        this.meshRegistry.clear();
        this.pdbRegistry.clear();
        this.meshLoadAttempted.clear();
        this.pdbLoadAttempted.clear();
        this.scaleMapping.clear();
    }

    /**
     *   Map Type ID -> Geometry
     */
    public mapIdToGeom(id, meshName, pdbName): void {
        this.logger.debug("Mesh for id ", id, " set to ", meshName);
        this.logger.debug("PDB for id ", id, " set to ", pdbName);
        this.visGeomMap.set(id, { meshName: meshName, pdbName: pdbName });
        if (
            meshName &&
            !this.meshRegistry.has(meshName) &&
            !this.meshLoadAttempted.get(meshName)
        ) {
            this.loadObj(meshName);
            this.meshLoadAttempted.set(meshName, true);
        }

        // try load pdb file also.
        if (
            pdbName &&
            !this.pdbRegistry.has(pdbName) &&
            !this.pdbLoadAttempted.get(pdbName)
        ) {
            this.loadPdb(pdbName);
            this.pdbLoadAttempted.set(pdbName, true);
        }
    }

    public getGeomFromId(id: number): Mesh | null {
        if (this.visGeomMap.has(id)) {
            const entry = this.visGeomMap.get(id);
            if (entry) {
                const meshName = entry.meshName;
                if (meshName && this.meshRegistry.has(meshName)) {
                    let mesh = this.meshRegistry.get(meshName);
                    if (mesh) {
                        return mesh;
                    }
                }
            }
        }

        return null;
    }

    public getPdbFromId(id: number): PDBModel | null {
        if (this.visGeomMap.has(id)) {
            const entry = this.visGeomMap.get(id);
            if (entry) {
                const pdbName = entry.pdbName;
                if (pdbName && this.pdbRegistry.has(pdbName)) {
                    const pdb = this.pdbRegistry.get(pdbName);
                    if (pdb) {
                        return pdb;
                    }
                }
            }
        }

        return null;
    }

    public mapFromJSON(name, filePath, callback?): Promise<void | Response> {
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
                        // mesh name is entry.mesh
                        // pdb name is entry.pdb
                        self.mapIdToGeom(Number(id), entry.mesh, entry.pdb);
                        self.setScaleForId(Number(id), entry.scale);
                    }
                });
                if (callback) {
                    callback(jsonData);
                }
            });
    }

    public resetBounds(boundsAsArray): void {
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

    public setScaleForId(id: number, scale: number): void {
        this.logger.debug("Scale for id ", id, " set to ", scale);
        this.scaleMapping.set(id, scale);
    }

    public getScaleForId(id: number): number {
        if (this.scaleMapping.has(id)) {
            let scale = this.scaleMapping.get(id);
            if (scale) {
                return scale;
            }
        }

        return 1;
    }

    /**
     *   Update Scene
     * */
    public updateScene(agents): void {
        this.currentSceneAgents = agents;
        let fiberIndex = 0;

        // these have been set to correspond to backend values
        const visTypes = Object.freeze({
            ID_VIS_TYPE_DEFAULT: 1000,
            ID_VIS_TYPE_FIBER: 1001,
        });

        let dx, dy, dz;

        agents.forEach((agentData, i) => {
            const visType = agentData["vis-type"];
            const typeId = agentData.type;
            const scale = this.getScaleForId(typeId);

            if (visType === visTypes.ID_VIS_TYPE_DEFAULT) {
                const visAgent = this.visAgents[i];

                const lastTypeId = visAgent.typeId;

                visAgent.typeId = typeId;
                visAgent.agentIndex = i;
                visAgent.active = true;
                if (typeId !== lastTypeId) {
                    // OR IF GEOMETRY IS SPHERE AND getGeomFromId RETURNS ANYTHING...
                    const meshGeom = this.getGeomFromId(typeId);
                    if (meshGeom) {
                        this.resetAgentMesh(visAgent, meshGeom);
                        if (meshGeom.name.includes("membrane")) {
                            this.membraneAgent = visAgent;
                        }
                        visAgent.setColor(
                            this.getColorForTypeId(typeId),
                            this.getColorIndexForTypeId(typeId)
                        );
                    }
                    const pdbGeom = this.getPdbFromId(typeId);
                    if (pdbGeom) {
                        this.resetAgentPDB(visAgent, pdbGeom);
                        visAgent.setColor(
                            this.getColorForTypeId(typeId),
                            this.getColorIndexForTypeId(typeId)
                        );
                    }
                }

                const runtimeMesh = visAgent.mesh;

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
                // update pdb transforms too
                const pdb = visAgent.pdbModel;
                if (pdb && pdb.pdb) {
                    // TODO Consider grouping these under one single transform,
                    // to save cpu in updating the same transform redundantly.
                    // Also see the THREE.LOD object type.
                    const obj = visAgent.pdbObjects;
                    obj.position.x = agentData.x;
                    obj.position.y = agentData.y;
                    obj.position.z = agentData.z;

                    obj.rotation.x = agentData.xrot;
                    obj.rotation.y = agentData.yrot;
                    obj.rotation.z = agentData.zrot;

                    obj.scale.x = 1.0; //agentData.cr * scale;
                    obj.scale.y = 1.0; //agentData.cr * scale;
                    obj.scale.z = 1.0; //agentData.cr * scale;

                    obj.visible = false;
                }

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

                const curvePoints: Vector3[] = [];
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
                runtimeFiberMesh.geometry = fibergeometry;
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
    }

    public animateCamera(): void {
        const lerpTarget = true;
        const lerpPosition = true;
        const lerpRate = 0.2;
        if (this.followObjectIndex !== NO_AGENT) {
            // keep camera at same distance from target.
            const direction = new Vector3().subVectors(
                this.camera.position,
                this.controls.target
            );
            const distance = direction.length();
            direction.normalize();

            const newTarget = new Vector3();
            const followedObject = this.visAgents[this.followObjectIndex];
            newTarget.copy(followedObject.mesh.position);

            // update controls target for orbiting
            if (lerpTarget) {
                this.controls.target.lerp(newTarget, lerpRate);
            } else {
                this.controls.target.copy(newTarget);
            }

            // update new camera position
            const newPosition = new Vector3();
            newPosition.subVectors(
                followedObject.mesh.position,
                direction.multiplyScalar(-distance)
            );
            if (lerpPosition) {
                this.camera.position.lerp(newPosition, lerpRate);
            } else {
                this.camera.position.copy(newPosition);
            }
        }
    }

    public findPathForAgentIndex(idx): PathData | null {
        let path = this.paths.find(path => {
            return path.agent === idx;
        });

        if (path) {
            return path;
        }
        return null;
    }

    public removePathForObject(obj): void {
        if (obj && obj.userData && obj.userData.index !== undefined) {
            this.removePathForAgentIndex(obj.userData.index);
        }
    }

    public addPathForObject(obj): void {
        if (obj && obj.userData && obj.userData.index !== undefined) {
            this.addPathForAgentIndex(obj.userData.index);
        }
    }

    // assumes color is a threejs color, or null/undefined
    public addPathForAgentIndex(
        idx,
        maxSegments?: number,
        color?: Color
    ): PathData {
        // make sure the idx is not already in our list.
        // could be optimized...
        const foundpath = this.findPathForAgentIndex(idx);
        if (foundpath) {
            if (foundpath.line) {
                foundpath.line.visible = true;
                return foundpath;
            }
        }

        if (!maxSegments) {
            maxSegments = MAX_PATH_LEN;
        }

        if (!color) {
            // get the agent's color. is there a simpler way?
            color = this.visAgents[idx].color.clone();
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

        pathdata.geometry.setAttribute(
            "position",
            new BufferAttribute(pathdata.points, 3)
        );
        pathdata.geometry.setAttribute(
            "color",
            new BufferAttribute(pathdata.colors, 3)
        );
        // path starts empty: draw range spans nothing
        pathdata.geometry.setDrawRange(0, 0);
        pathdata.line = new LineSegments(pathdata.geometry, pathdata.material);
        pathdata.line.frustumCulled = false;
        this.agentPathGroup.add(pathdata.line);

        this.paths.push(pathdata);
        return pathdata;
    }

    public removePathForAgentIndex(idx): void {
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
        this.agentPathGroup.remove(path.line as Object3D);

        this.paths.splice(pathindex, 1);
    }

    public addPointToPath(path, x, y, z, dx, dy, dz): void {
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
                    this.pathEndColor.r,
                    a
                );
                path.colors[ic * 6 + 1] = lerp(
                    path.color.g,
                    this.pathEndColor.g,
                    a
                );
                path.colors[ic * 6 + 2] = lerp(
                    path.color.b,
                    this.pathEndColor.b,
                    a
                );

                // the very last point should be b=0
                const b = 1.0 - (ic + 1) / (path.numSegments + 1);
                path.colors[ic * 6 + 3] = lerp(
                    path.color.r,
                    this.pathEndColor.r,
                    b
                );
                path.colors[ic * 6 + 4] = lerp(
                    path.color.g,
                    this.pathEndColor.g,
                    b
                );
                path.colors[ic * 6 + 5] = lerp(
                    path.color.b,
                    this.pathEndColor.b,
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

    public setShowPaths(showPaths): void {
        for (let i = 0; i < this.paths.length; ++i) {
            let line = this.paths[i].line;
            if (line) {
                line.visible = showPaths;
            }
        }
    }

    public setShowMeshes(showMeshes): void {
        const nMeshes = this.visAgents.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            const visAgent = this.visAgents[i];
            if (visAgent.active) {
                visAgent.mesh.visible = showMeshes;
            }
        }
    }

    public setShowBounds(showBounds): void {
        this.boundingBoxMesh.visible = showBounds;
    }

    public showPathForAgentIndex(idx, visible): void {
        const path = this.findPathForAgentIndex(idx);
        if (path) {
            if (path.line) {
                path.line.visible = visible;
            }
        }
    }

    public hideUnusedMeshes(numberOfAgents): void {
        const nMeshes = this.visAgents.length;
        for (let i = numberOfAgents; i < MAX_MESHES && i < nMeshes; i += 1) {
            const visAgent = this.visAgents[i];
            visAgent.hideAndDeactivate();

            // hide the path if we're hiding the agent. should we remove the path here?
            this.showPathForAgentIndex(i, false);
        }
    }

    public hideUnusedFibers(numberOfFibers): void {
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

    public clear(): void {
        this.hideUnusedMeshes(0);
        this.hideUnusedFibers(0);
    }

    public resetAllGeometry(): void {
        // set all runtime meshes back to spheres.
        const nMeshes = this.visAgents.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            const visAgent = this.visAgents[i];
            this.agentMeshGroup.remove(visAgent.mesh);
            visAgent.resetMesh();
            this.agentMeshGroup.add(visAgent.mesh);

            this.agentPDBGroup.remove(visAgent.pdbObjects);
            visAgent.resetPDB();
        }
    }

    public update(agents): void {
        this.updateScene(agents);

        const numberOfAgents = agents.length;
        if (this.lastNumberOfAgents > numberOfAgents) {
            this.hideUnusedMeshes(numberOfAgents);
        }
        this.lastNumberOfAgents = numberOfAgents;
    }
}

export { VisGeometry, NO_AGENT };
export default VisGeometry;
