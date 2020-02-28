/* globals global Request*/
/* eslint no-undef: "error" */


// Three JS is assumed to be in the global scope in extensions
//  such as OrbitControls.js below
import * as THREE from  'three';
global.THREE = THREE;

import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { WEBGL } from 'three/examples/jsm/WebGL.js';

import './three/OrbitControls.js';

import jsLogger from 'js-logger';

import MembraneShader from './rendering/MembraneShader.js';
import MoleculeRenderer from './rendering/MoleculeRenderer.js';

const MAX_PATH_LEN = 32;
const MAX_MESHES = 5000;
const BACKGROUND_COLOR = new THREE.Color(0xcccccc);
const PATH_END_COLOR = BACKGROUND_COLOR;
const DEFAULT_VOLUME_BOUNDS = [-150, -150, -150, 150, 150, 150];
const BOUNDING_BOX_COLOR = new THREE.Color(0x6e6e6e);

function lerp(x0, x1, alpha) {
    return x0 + (x1 - x0) * alpha;
}

class VisGeometry2 {
    constructor(loggerLevel) {
        this.handleTrajectoryData = this.handleTrajectoryData.bind(this);
        // map particle type id to its mesh file name
        this.visGeomMap = new Map();
        this.meshRegistry = new Map();
        this.meshLoadAttempted = new Map();
        // map particle type id to its mesh uniform scale value
        this.scaleMapping = new Map();
        this.geomCount = MAX_MESHES;
        this.colors = [];
        this.desatColors = [];
        this.materials = [];
        this.desatMaterials = [];
        this.highlightMaterial = new THREE.MeshBasicMaterial({color: new THREE.Color(1,0,0)});
        this.followObject = null;
        this.runTimeMeshes = [];
        this.runTimeFiberMeshes = new Map();
        this.mlastNumberOfAgents = 0;
        this.mcolorVariant = 50;
        this.fixLightsToCamera = true;
        this.highlightedId = -1;

        // will store data for all agents that are drawing paths
        this.paths = [];

        // the canonical default geometry instance
        this.sphereGeometry = new THREE.SphereBufferGeometry(1, 32, 32);

        this.membrane = {
            // assume only one membrane mesh 
            mesh: null,
            sim: MembraneShader.MembraneShaderSim ? new MembraneShader.MembraneShaderSim() : null,
            MembraneShader: MembraneShader.MembraneShader,
            material: null,
            runtimeMeshIndex: -1,
        };

        this.moleculeRenderer = new MoleculeRenderer();
        
        this.mlogger = jsLogger.get('visgeometry');
        this.mlogger.setLevel(loggerLevel);
    }

    get logger() { return this.mlogger; }

    get lastNumberOfAgents() { return this.mlastNumberOfAgents; }

    set lastNumberOfAgents(val) { this.mlastNumberOfAgents = val; }

    get colorVariant() { return this.mcolorVariant; }

    set colorVariant(val) { this.mcolorVariant = val; }

    get renderDom() { return this.renderer.domElement; }

    handleTrajectoryData(trajectoryData) {
        // get bounds.
        if (trajectoryData.hasOwnProperty("boxSizeX") && trajectoryData.hasOwnProperty("boxSizeY") && trajectoryData.hasOwnProperty("boxSizeZ")) {
            const bx = trajectoryData.boxSizeX;
            const by = trajectoryData.boxSizeY;
            const bz = trajectoryData.boxSizeZ;
            const epsilon = 0.000001;
            if ((Math.abs(bx) < epsilon) || (Math.abs(by) < epsilon) || (Math.abs(bz) < epsilon)) {
                console.log("WARNING: Bounding box: at least one bound is zero; using default bounds");
                this.resetBounds(DEFAULT_VOLUME_BOUNDS);
            }
            else {
                this.resetBounds([-bx/2, -by/2, -bz/2, bx/2, by/2, bz/2]);
            }
        }
        else {
            this.resetBounds(DEFAULT_VOLUME_BOUNDS);
        }
    }

    resetCamera() {
        this.controls.reset();
    }

    getFollowObject() {
        return this.followObject;
    }

    setFollowObject(obj) {
        if (obj && obj.userData && obj.userData.index === this.membrane.runtimeMeshIndex) {
            return;
        }
        if (this.followObject) {
            this.assignMaterial(this.followObject, this.followObject.userData.baseMaterial);
        }
        this.followObject = obj;
        // put the camera on it
        if (obj) {
            this.controls.target.copy(obj.position);
            this.assignMaterial(obj, this.highlightMaterial);
        }
    }

    // equivalent to setFollowObject(null)
    unfollow() {
        this.followObject = null;
    }

    setHighlightById(id) {
        if (this.highlightedId === id) {
            return;
        }
        this.highlightedId = id;

        // go over all objects and update material
        let nMeshes = this.runTimeMeshes.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            const runtimeMesh = this.getMesh(i);
            if (runtimeMesh.userData && runtimeMesh.userData.active) {
                runtimeMesh.userData.baseMaterial = this.getMaterial(runtimeMesh.userData.materialType, runtimeMesh.userData.typeId);
                this.assignMaterial(runtimeMesh, runtimeMesh.userData.baseMaterial);
            }
        }
    }

    dehighlight() {
        this.setHighlightById(-1);
    }

    onNewRuntimeGeometryType(meshName) {
        // find all typeIds for this meshName
        let typeIds = [...this.visGeomMap.entries()]
            .filter(({ 1: v }) => v === meshName)
            .map(([k]) => k);

        // assuming the meshGeom has already been added to the registry
        const meshGeom = this.meshRegistry.get(meshName);

        // go over all objects and update mesh of this typeId
        let nMeshes = this.runTimeMeshes.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            let runtimeMesh = this.getMesh(i);
            if (runtimeMesh.userData && typeIds.includes(runtimeMesh.userData.typeId)) {
                const isFollowedObject = (runtimeMesh === this.followObject);

                const p = runtimeMesh.position;
                const r = runtimeMesh.rotation;
                const s = runtimeMesh.scale;
                runtimeMesh = this.setupMeshGeometry(i, runtimeMesh, meshGeom, isFollowedObject);
                runtimeMesh.position.copy(p);
                runtimeMesh.rotation.copy(r);
                runtimeMesh.scale.copy(s);
            }
        }
    }

    setUpControls(element) {
        this.controls = new THREE.OrbitControls(this.camera, element);
        this.controls.maxDistance = 750;
        this.controls.minDistance = 5;
        this.controls.zoomSpeed = 2;
        this.controls.enablePan = false;
    }

    /**
    *   Setup ThreeJS Scene
    * */
    setupScene() {
        let initWidth = 100;
        let initHeight = 100;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75, initWidth / initHeight, 0.1, 1000,
        );

        this.resetBounds(DEFAULT_VOLUME_BOUNDS);

        // this.dl = null;
        // this.dl = new THREE.DirectionalLight(0xffffff, 0.6);
        // this.dl.position.set(0, 0, 1);
        // this.scene.add(this.dl);

        // this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.6);
        // this.hemiLight.color.setHSL(0.095, 1, 0.75);
        // this.hemiLight.groundColor.setHSL(0.6, 1, 0.6);
        // this.hemiLight.position.set(0, 1, 0);
        // this.scene.add(this.hemiLight);

        if ( WEBGL.isWebGL2Available() === false ) {
            this.renderer = new THREE.WebGLRenderer();
        }
        else {
            const canvas = document.createElement( 'canvas' );
            const context = canvas.getContext( 'webgl2', { alpha: false } );
            this.renderer = new THREE.WebGLRenderer( { canvas: canvas, context: context } );
        }

        this.renderer.setSize(initWidth, initHeight); // expected to change when reparented
        this.renderer.setClearColor(BACKGROUND_COLOR, 1);
        this.renderer.clear();

        this.camera.position.z = 5;
    }

    loadObj(meshName) {
        const objLoader = new OBJLoader();
        objLoader.load(
            `https://aics-agentviz-data.s3.us-east-2.amazonaws.com/meshes/obj/${meshName}`,
            (object) => {
                this.logger.debug('Finished loading mesh: ', meshName);
                this.addMesh(meshName, object);
                this.onNewRuntimeGeometryType(meshName);
            },
            (xhr) => {
                this.logger.debug(meshName, ' ', `${xhr.loaded / xhr.total * 100}% loaded`);
            },
            (error) => {
                this.logger.debug('Failed to load mesh: ', error, meshName);
            },
        );
    }

    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        if (this.membrane.sim) {
            this.membrane.sim.resize(width, height);
        }
        this.moleculeRenderer.resize(width, height);
    }

    reparent(parent) {
        if(parent === 'undefined' || parent == null) {
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

    disableControls() {
        this.controls.enabled = false;
    }

    enableControls() {
        this.controls.enabled = true;
    }

    render(time) {
        //if(this.runTimeMeshes.length == 0) { return; }

        var elapsedSeconds = time / 1000.;

        if (this.membrane.sim) {
            this.membrane.sim.render(this.renderer, elapsedSeconds);
        }

        if (this.membrane.mesh && this.membrane.material) {
            this.membrane.material.uniforms.iTime.value = elapsedSeconds;

            if (this.membrane.sim) {
                this.membrane.material.uniforms.iChannel0.value = this.membrane.sim.getOutputTarget().texture;
                this.membrane.material.uniforms.iChannelResolution0.value = new THREE.Vector2(this.membrane.sim.getOutputTarget().width, this.membrane.sim.getOutputTarget().height);
            }

            this.renderer.getDrawingBufferSize(this.membrane.material.uniforms.iResolution.value);
        }

        this.controls.update();

        // if (this.dl && this.fixLightsToCamera) {
        //     // position directional light at camera (facing scene, as headlight!)
        //     this.dl.position.copy(this.camera.position);
        // }
        // if (this.hemiLight && this.fixLightsToCamera) {
        //     // make hemi light come down from vertical of screen (camera up)
        //     this.hemiLight.position.setFromMatrixColumn(this.camera.matrixWorld, 1);
        // }

        this.moleculeRenderer.render(this.renderer, this.camera, null);
        //this.renderer.render(this.scene, this.camera);
    }

    /**
    *   Run Time Mesh functions
    */
    createMaterials(colors) {
        this.colors = [];
        const numColors = colors.length;
        for (let i = 0; i < numColors; i += 1) {
            this.materials.push(
                new THREE.MeshLambertMaterial({ color: colors[i] }),
            );
            const hsl = {};
            const desatColor = new THREE.Color(colors[i]);
            hsl = desatColor.getHSL(hsl);
            desatColor.setHSL(hsl.h, 0.5*hsl.s, hsl.l);
            this.colors.push(colors[i]);
            this.desatColors.push(desatColor);
            this.desatMaterials.push(
                new THREE.MeshLambertMaterial({ color: desatColor, opacity: 0.25, transparent: true }),
            );
        }
    }

    createMeshes() {
        const { scene } = this;
        this.geomCount = MAX_MESHES;
        const sphereGeom = this.getSphereGeom();
        const { materials } = this;

        // empty buffer of molecule positions, to be filled. (init all to origin)
        // currently one "atom" per molecule per geomCount
        this.moleculeRenderer.createMoleculeBuffer(this.geomCount);

        //multipass render:
        // draw moleculebuffer into several render targets to store depth, normals, colors
        // draw quad to composite the buffers into final frame

        // create placeholder meshes and fibers
        for (let i = 0; i < this.geomCount; i += 1) {
            const runtimeMesh = new THREE.Mesh(sphereGeom, materials[0]);

            runtimeMesh.name = `Mesh_${i.toString()}`;
            runtimeMesh.visible = false;
            this.runTimeMeshes[i] = runtimeMesh;
            scene.add(runtimeMesh);

            const fibercurve = new THREE.LineCurve3(
                new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1),
            );
            const geometry = new THREE.TubeBufferGeometry(fibercurve, 1, 1, 1, false);
            const runtimeFiberMesh = new THREE.Mesh(geometry, materials[0]);
            runtimeFiberMesh.name = `Fiber_${i.toString()}`;
            runtimeFiberMesh.visible = false;
            this.runTimeFiberMeshes.set(runtimeFiberMesh.name, runtimeFiberMesh);
            scene.add(runtimeFiberMesh);

            const runtimeFiberEndcapMesh0 = new THREE.Mesh(sphereGeom, materials[0]);
            runtimeFiberEndcapMesh0.name = `FiberEnd0_${i.toString()}`;
            runtimeFiberEndcapMesh0.visible = false;
            this.runTimeFiberMeshes.set(runtimeFiberEndcapMesh0.name, runtimeFiberEndcapMesh0);
            scene.add(runtimeFiberEndcapMesh0);

            const runtimeFiberEndcapMesh1 = new THREE.Mesh(sphereGeom, materials[0]);
            runtimeFiberEndcapMesh1.name = `FiberEnd1_${i.toString()}`;
            runtimeFiberEndcapMesh1.visible = false;
            this.runTimeFiberMeshes.set(runtimeFiberEndcapMesh1.name, runtimeFiberEndcapMesh1);
            scene.add(runtimeFiberEndcapMesh1);
        }
    }

    addMesh(meshName, mesh) {
        this.meshRegistry.set(meshName, mesh);
        if (meshName.includes("membrane")) {
            this.membrane.mesh = mesh;
        }
    }

    getMesh(index) {
        return this.runTimeMeshes[index];
    }

    resetMesh(index, obj) {
        this.runTimeMeshes[index] = obj;
    }

    getFiberMesh(name) {
        return this.runTimeFiberMeshes.get(name);
    }

    getMaterial(index, typeId) {
        // if no highlight, or if this is the highlighed type, then use regular material, otherwise use desaturated.
        // todo strings or numbers for these ids?????
        const isHighlighted = (this.highlightedId == -1 || this.highlightedId == typeId);

        // membrane is special
        if (typeId === this.membrane.typeId) {
            return isHighlighted ? this.membrane.material : this.desatMaterials[0];
        }

        let matArray = isHighlighted ? this.materials : this.desatMaterials;
        return matArray[Number(index) % matArray.length];
    }

    setupMembrane(membraneData) {
        if (!membraneData) {
            return;
        }

        if (this.membrane && this.membrane.mesh) {
            this.scene.remove(this.membrane.mesh);
        }

        const texsplat = new THREE.TextureLoader().load("assets/splat.png");
        texsplat.wrapS = THREE.RepeatWrapping;
        texsplat.wrapT = THREE.RepeatWrapping;

        const material = this.membrane.MembraneShader.clone();
        material.uniforms.splat.value = texsplat;

        this.membrane.material = material;

        if (this.membrane.runtimeMeshIndex !== -1) {
            const m = this.getMesh(this.membrane.runtimeMeshIndex);
            this.assignMaterial(m, this.membrane.material);
        }
    }

    /**
    *   Data Management
    */
    resetMapping() {
        this.visGeomMap.clear();
        this.meshRegistry.clear();
        this.meshLoadAttempted.clear();
        this.scaleMapping.clear();
    }

    /**
    *   Map Type ID -> Geometry
    */
    mapTypeIdToGeom(id, meshName) {
        this.logger.debug('Mesh for id ', id, ' set to ', meshName);
        this.visGeomMap.set(id, meshName);
        if (meshName.includes("membrane")) {
            this.membrane.typeId = id;
        }

        if (!this.meshRegistry.has(meshName) && !this.meshLoadAttempted.get(meshName)) {
            this.loadObj(meshName);
            this.meshLoadAttempted.set(meshName, true);
        }
    }

    getGeomFromTypeId(id) {
        if (this.visGeomMap.has(id)) {
            const meshName = this.visGeomMap.get(id);
            return this.meshRegistry.get(meshName);
        }

        return null;
    }

    fetchGeometryData(name, filePath, callback) {
        const jsonRequest = new Request(filePath);
        const self = this;
        return fetch(jsonRequest).then(
            response => response.json(),
        ).then(
            (data) => {
                self.resetMapping();
                const jsonData = data;
                self.logger.debug('JSON Mesh mapping loaded: ', jsonData);
                Object.keys(jsonData).forEach((id) => {
                    const entry = jsonData[id];
                    if (id === "size") {
                        console.log("WARNING: Ignoring deprecated bounding box data");
                    }
                    else {
                        self.mapTypeIdToGeom(Number(id), entry.mesh);
                        self.setScaleForTypeId(Number(id), entry.scale);
                    }
                });
                if (callback) {
                    callback(jsonData);
                }
            },
        );
    }


    resetBounds(boundsAsArray) {
        if (!boundsAsArray) {
            console.log("invalid bounds received");
            return;
        }
        const visible = this.boundingBoxMesh ? this.boundingBoxMesh.visible : true;
        this.scene.remove(this.boundingBoxMesh);
        // array is minx,miny,minz, maxx,maxy,maxz
        this.boundingBox = new THREE.Box3(
            new THREE.Vector3(boundsAsArray[0], boundsAsArray[1], boundsAsArray[2]),
            new THREE.Vector3(boundsAsArray[3], boundsAsArray[4], boundsAsArray[5])
        );
        this.boundingBoxMesh = new THREE.Box3Helper( this.boundingBox, BOUNDING_BOX_COLOR );
        this.boundingBoxMesh.visible = visible;
        this.scene.add(this.boundingBoxMesh);
    }

    setScaleForTypeId(id, scale) {
        this.logger.debug('Scale for id ', id, ' set to ', scale);
        this.scaleMapping.set(id, scale);
    }

    getScaleForTypeId(id) {
        if (this.scaleMapping.has(id)) {
            return this.scaleMapping.get(id);
        }

        return 1;
    }

    /**
    *   Default Geometry
    */
    getSphereGeom() {
        const sphereId = -1;
        if (!this.meshRegistry.has(sphereId)) {
            this.meshRegistry.set(sphereId, this.sphereGeometry);
        }

        return this.meshRegistry.get(sphereId);
    }

    /**
    *   Update Scene
    * */
    updateScene(agents) {
        const sphereGeometry = this.getSphereGeom();
        let fiberIndex = 0;

        // these have been set to correspond to backend values
        const visTypes = Object.freeze({
            ID_VIS_TYPE_DEFAULT: 1000,
            ID_VIS_TYPE_FIBER: 1001,
        });

        let dx, dy, dz;
        // The agents sent over are mapped by an integer id
        
        const buf = new Float32Array(3*agents.length);

        agents.forEach((agentData, i) => {

            const visType = agentData['vis-type'];
            const typeId = agentData.type;
            const scale = this.getScaleForTypeId(typeId);

            if (visType === visTypes.ID_VIS_TYPE_DEFAULT) {
                // const materialType = (typeId + 1) * this.colorVariant;
                // let runtimeMesh = this.getMesh(i);
                // const isFollowedObject = (runtimeMesh === this.followObject);

                // if (!runtimeMesh.userData) {
                //     runtimeMesh.userData = { 
                //         active: true,
                //         baseMaterial: this.getMaterial(materialType, typeId),
                //         index: i,
                //         typeId: typeId,
                //         materialType: materialType
                //     }
                // }
                // else {
                //     runtimeMesh.userData.active = true;
                //     runtimeMesh.userData.baseMaterial = this.getMaterial(materialType, typeId);
                //     runtimeMesh.userData.index = i;
                //     runtimeMesh.userData.typeId = typeId;
                //     runtimeMesh.userData.materialType = materialType;
                // }

                // if (runtimeMesh.geometry === sphereGeometry) {
                //     const meshGeom = this.getGeomFromId(typeId);
                //     if (meshGeom && meshGeom.children) {
                //         // in theory this code should never be hit, due to the way the mesh geometry is updated in loadObj
                //         runtimeMesh = this.setupMeshGeometry(i, runtimeMesh, meshGeom, isFollowedObject);
                //     }
                // }

                // dx = agentData.x - runtimeMesh.position.x; 
                // dy = agentData.y - runtimeMesh.position.y; 
                // dz = agentData.z - runtimeMesh.position.z; 
                // runtimeMesh.position.x = agentData.x;
                // runtimeMesh.position.y = agentData.y;
                // runtimeMesh.position.z = agentData.z;

                buf[i*3 + 0] = agentData.x;
                buf[i*3 + 1] = agentData.y;
                buf[i*3 + 2] = agentData.z;

                // runtimeMesh.rotation.x = agentData.xrot;
                // runtimeMesh.rotation.y = agentData.yrot;
                // runtimeMesh.rotation.z = agentData.zrot;

                // runtimeMesh.visible = true;

                // runtimeMesh.scale.x = agentData.cr * scale;
                // runtimeMesh.scale.y = agentData.cr * scale;
                // runtimeMesh.scale.z = agentData.cr * scale;

                // const path = this.findPathForAgentIndex(i);
                // if (path) {
                //     this.addPointToPath(path, agentData.x, agentData.y, agentData.z, dx, dy, dz);
                // }
            } else if (visType === visTypes.ID_VIS_TYPE_FIBER) {
                const name = `Fiber_${fiberIndex.toString()}`;

                const runtimeFiberMesh = this.getFiberMesh(name);

                const curvePoints = [];
                const { subpoints } = agentData;
                const numSubPoints = subpoints.length;
                const collisionRadius = agentData.cr;
                for (let j = 0; j < numSubPoints; j += 3) {
                    const x = subpoints[j];
                    const y = subpoints[j + 1];
                    const z = subpoints[j + 2];
                    curvePoints.push(new THREE.Vector3(x, y, z));
                }
                const fibercurve = new THREE.CatmullRomCurve3(curvePoints);
                const fibergeometry = new THREE.TubeBufferGeometry(
                    fibercurve, 4 * numSubPoints / 3, collisionRadius * scale * 0.5, 8, false,
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
                runtimeFiberEncapMesh1.position.x = curvePoints[curvePoints.length - 1].x;
                runtimeFiberEncapMesh1.position.y = curvePoints[curvePoints.length - 1].y;
                runtimeFiberEncapMesh1.position.z = curvePoints[curvePoints.length - 1].z;
                runtimeFiberEncapMesh1.scale.x = collisionRadius * scale * 0.5;
                runtimeFiberEncapMesh1.scale.y = collisionRadius * scale * 0.5;
                runtimeFiberEncapMesh1.scale.z = collisionRadius * scale * 0.5;
                runtimeFiberEncapMesh1.visible = true;

                fiberIndex += 1;
            }
        });

        this.moleculeRenderer.updateMolecules(buf, agents.length);

        if (this.followObject) {
            // keep camera at same distance from target.
            const direction = new THREE.Vector3().subVectors( this.camera.position, this.controls.target );
            const distance = direction.length();

            // update controls target for orbiting
            this.controls.target.copy(this.followObject.position);

            direction.normalize();
            this.camera.position.subVectors(this.controls.target, direction.multiplyScalar(-distance));
        }
    }

    setupMeshGeometry(i, runtimeMesh, meshGeom, isFollowedObject) {
        if (this.membrane.mesh === meshGeom) {
            if (this.membrane.mesh && runtimeMesh.children.length !== this.membrane.mesh.children.length) {
                // to avoid a deep clone of userData, just reuse the instance
                const userData = runtimeMesh.userData;
                runtimeMesh.userData = null;
                this.scene.remove(runtimeMesh);
                runtimeMesh = this.membrane.mesh.clone();
                runtimeMesh.userData = userData;
                this.assignMaterial(runtimeMesh, this.membrane.material || runtimeMesh.userData.baseMaterial);
                this.scene.add(runtimeMesh);
                this.resetMesh(i, runtimeMesh);
                this.membrane.runtimeMeshIndex = i;
            }
        }
        else {
            // to avoid a deep clone of userData, just reuse the instance
            const userData = runtimeMesh.userData;
            runtimeMesh.userData = null;
            this.scene.remove(runtimeMesh);
            runtimeMesh = meshGeom.clone();
            runtimeMesh.userData = userData;
            this.scene.add(runtimeMesh);
            this.resetMesh(i, runtimeMesh);

            if (isFollowedObject) {
                this.assignMaterial(runtimeMesh, this.highlightMaterial);
            }
            else {
                this.assignMaterial(runtimeMesh, runtimeMesh.userData.baseMaterial);
            }

        }
        return runtimeMesh;
    }

    assignMaterial(runtimeMesh, material) {
        if (runtimeMesh instanceof THREE.Mesh) {
            runtimeMesh.material = material;
        }
        else {
            runtimeMesh.traverse( (child) => {
                if ( child instanceof THREE.Mesh ) {
                    child.material = material;
                }
            });
        }
    }

    getMaterialOfAgentIndex(idx) {
        const runtimeMesh = this.getMesh(idx);
        if (runtimeMesh.userData) {
            return runtimeMesh.userData.baseMaterial;
        }
        return undefined;
    }

    findPathForAgentIndex(idx) {
        return this.paths.find((path)=>{return path.agent===idx;});
    }

    removePathForObject(obj) {
        if (obj && obj.userData && obj.userData.index !== undefined) {
            this.removePathForAgentIndex(obj.userData.index);
        }
    }

    addPathForObject(obj) {
        if (obj && obj.userData && obj.userData.index !== undefined) {
            this.addPathForAgentIndex(obj.userData.index);
        }
    }

    // assumes color is a threejs color, or null/undefined
    addPathForAgentIndex(idx, maxSegments, color) {
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
            color = mat ? mat.color.clone() : new THREE.Color(0xffffff);
        }

        const pathdata = {
            agent: idx,
            numSegments: 0,
            maxSegments: maxSegments,
            color: color,
            points: new Float32Array(maxSegments * 3 * 2),
            colors: new Float32Array(maxSegments * 3 * 2),
            geometry: new THREE.BufferGeometry(),
            material: new THREE.LineBasicMaterial({
                // the line will be colored per-vertex
                vertexColors: THREE.VertexColors,
            }),
            // will create line "lazily" when the line has more than 1 point(?)
            line: null,
        };
        
        pathdata.geometry.setAttribute( 'position', new THREE.BufferAttribute( pathdata.points, 3 ) );
        pathdata.geometry.setAttribute( 'color', new THREE.BufferAttribute( pathdata.colors, 3 ) );
        // path starts empty: draw range spans nothing
        pathdata.geometry.setDrawRange( 0, 0 );
        pathdata.line = new THREE.LineSegments(pathdata.geometry, pathdata.material);
        pathdata.line.frustumCulled = false;
        this.scene.add(pathdata.line);


        this.paths.push(pathdata);
        return pathdata;
    }

    removePathForAgentIndex(idx) {
        const pathindex = this.paths.findIndex((path)=>{return path.agent===idx;});
        if (pathindex === -1) {
            console.log("attempted to remove path for agent " + idx + " that doesn't exist.");
            return;
        }
        const path = this.paths[pathindex];
        this.scene.remove(path.line);

        this.paths.splice(pathindex, 1);
    }

    addPointToPath(path, x, y, z, dx, dy, dz) {
        if ((x === dx) && (y === dy) && (z === dz)) {
            return;
        }
        // Check for periodic boundary condition:
        // if any agent moved more than half the volume size in one step, 
        // assume it jumped the boundary going the other way.
        if (Math.abs(dx) > VOLUME_DIMS.x/2 || Math.abs(dy) > VOLUME_DIMS.y/2 || Math.abs(dz) > VOLUME_DIMS.z/2) {
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
            path.points.copyWithin(0, 3*2, path.maxSegments*3*2);
            path.numSegments = path.maxSegments-1;
        }
        else {
            // rewrite all the colors. this might be prohibitive for lots of long paths.
            for (let ic = 0; ic < path.numSegments+1; ++ic) {
                // the very first point should be a=1
                const a = 1.0 - (ic)/(path.numSegments+1);
                path.colors[ic*6+0] = lerp(path.color.r, PATH_END_COLOR.r, a);
                path.colors[ic*6+1] = lerp(path.color.g, PATH_END_COLOR.g, a);
                path.colors[ic*6+2] = lerp(path.color.b, PATH_END_COLOR.b, a);

                // the very last point should be b=0
                const b = 1.0 - (ic+1)/(path.numSegments+1); 
                path.colors[ic*6+3] = lerp(path.color.r, PATH_END_COLOR.r, b);
                path.colors[ic*6+4] = lerp(path.color.g, PATH_END_COLOR.g, b);
                path.colors[ic*6+5] = lerp(path.color.b, PATH_END_COLOR.b, b);
            }
            path.line.geometry.attributes.color.needsUpdate = true;
        }
        // add a segment to this line
        path.points[path.numSegments*2*3+0] = x-dx;
        path.points[path.numSegments*2*3+1] = y-dy;
        path.points[path.numSegments*2*3+2] = z-dz;
        path.points[path.numSegments*2*3+3] = x;
        path.points[path.numSegments*2*3+4] = y;
        path.points[path.numSegments*2*3+5] = z;

        path.numSegments++;

        path.line.geometry.setDrawRange( 0, path.numSegments*2 );
        path.line.geometry.attributes.position.needsUpdate = true; // required after the first render
    }

    setShowPaths(showPaths) {
        for (let i = 0; i < this.paths.length; ++i) {
            this.paths[i].line.visible = showPaths;
        }
    }

    setShowMeshes(showMeshes) {
        let nMeshes = this.runTimeMeshes.length;
        for (let i = 0; i < MAX_MESHES && i < nMeshes; i += 1) {
            const runtimeMesh = this.getMesh(i);
            if (runtimeMesh.userData && runtimeMesh.userData.active) {
                runtimeMesh.visible = showMeshes;
            }
        }
    }

    setShowBounds(showBounds) {
        this.boundingBoxMesh.visible = showBounds;
    }

    showPathForAgentIndex(idx, visible) {
        const path = this.findPathForAgentIndex(idx);
        if (path) {
            path.line.visible = visible;
        }
    }

    hideUnusedMeshes(numberOfAgents) {
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

    clear() {
        this.hideUnusedMeshes(0);
    }

    update(agents) {
        const numberOfAgents = agents.length;
        this.updateScene(agents, numberOfAgents);

        if (this.lastNumberOfAgents > numberOfAgents) {
            this.hideUnusedMeshes(numberOfAgents);

        }
        this.lastNumberOfAgents = numberOfAgents;
    }
}

export { VisGeometry2 };
export default VisGeometry2;
