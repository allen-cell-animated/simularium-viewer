import { ShaderMaterial, Vector2 } from "three";

const dataTextureSize = 32;

const common = `
// play values:
#define GridX 128.          // any value between 20 to 300 is fine
#define Bouncefac 1.0     // try 0.5 for nonelastic collisions
#define Gravity -0.0000     // try -0.0003

// fixed values
#define GridY floor(GridX*0.5) // floor(GridX*9./16.)
#define Radius 1.0 // minimum value would be sqrt(1*1 + 1*1)/2.0 + max_velocity * 2.  so 1.0 is a safe value
#define getColorSize(grid) textureLod(iChannel0,(grid*vec2(1.,2.0)+vec2(5.1,11.1))/iResolution.xy,0.)
#define getPos(grid) textureLod(iChannel0,(grid*vec2(1.,2.0)+vec2(5.1,10.1))/iResolution.xy,0.).xy
#define getVel(grid) textureLod(iChannel0,(grid*vec2(1.,2.0)+vec2(5.1,10.1))/iResolution.xy,0.).zw
`;

const vertexShader = `
    uniform float iTime;
    uniform vec2 iResolution;

    varying vec2 vUv;
    varying vec3 n;
    varying vec3 vLightFront;
    varying vec3 vIndirectFront;

    #define saturate(a) clamp( a, 0.0, 1.0 )

    struct GeometricContext {
        vec3 position;
        vec3 normal;
        vec3 viewDir;
    };
    struct IncidentLight {
        vec3 color;
        vec3 direction;
        bool visible;
    };

    struct DirectionalLight {
        vec3 direction;
        vec3 color;
        int shadow;
        float shadowBias;
        float shadowRadius;
        vec2 shadowMapSize;
    };
    uniform DirectionalLight directionalLights[ 1 ];
    void getDirectionalDirectLightIrradiance( const in DirectionalLight directionalLight, const in GeometricContext geometry, out IncidentLight directLight ) {
        directLight.color = directionalLight.color;
        directLight.direction = directionalLight.direction;
        directLight.visible = true;
    }

    struct HemisphereLight {
        vec3 direction;
        vec3 skyColor;
        vec3 groundColor;
    };
    uniform HemisphereLight hemisphereLights[ 1 ];
    vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in GeometricContext geometry ) {
        float dotNL = dot( geometry.normal, hemiLight.direction );
        float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
        vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
        #ifndef PHYSICALLY_CORRECT_LIGHTS
            irradiance *= PI;
        #endif
        return irradiance;
    }

    void main()	{
        vec3 p = position.xyz;
        vec4 modelViewPosition = modelViewMatrix * vec4(p, 1.0);
        vUv = uv;
        n = normalMatrix * normal;

        GeometricContext geometry;
        geometry.position = modelViewPosition.xyz;
        geometry.normal = normalize( n );
        geometry.viewDir = normalize( -modelViewPosition.xyz );

        // per-vertex lighting compatible with the rest of three.js
        vLightFront = vec3(0.0);
        
        IncidentLight directLight;
        getDirectionalDirectLightIrradiance( directionalLights[ 0 ], geometry, directLight );
        float dotNL = dot( geometry.normal, directLight.direction );
        vec3 directLightColor_Diffuse = PI * directLight.color;
        vLightFront += saturate( dotNL ) * directLightColor_Diffuse;
        vIndirectFront += getHemisphereLightIrradiance( hemisphereLights[ 0 ], geometry );

        gl_Position = projectionMatrix * modelViewPosition;
    }
`;

const fragmentShader =
    common +
    `
    uniform float iTime;
    uniform vec2 iResolution;
    uniform vec2 uvscale;
#if USE_SIM
    uniform sampler2D iChannel0;
    uniform vec2 iChannelResolution0;
#endif
    uniform sampler2D splat;

    uniform vec3 ambientLightColor;

    varying vec2 vUv;
    varying vec3 n;
    varying vec3 vLightFront;
    varying vec3 vIndirectFront;

    struct ReflectedLight {
        vec3 directDiffuse;
        vec3 directSpecular;
        vec3 indirectDiffuse;
        vec3 indirectSpecular;
    };

    vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
        vec3 irradiance = ambientLightColor;
        #ifndef PHYSICALLY_CORRECT_LIGHTS
            irradiance *= PI;
        #endif
        return irradiance;
    }
    struct IncidentLight {
        vec3 color;
        vec3 direction;
        bool visible;
    };

    struct DirectionalLight {
        vec3 direction;
        vec3 color;
        int shadow;
        float shadowBias;
        float shadowRadius;
        vec2 shadowMapSize;
    };
    uniform DirectionalLight directionalLights[ 1 ];

    float noise3D(vec3 p)
    {
        return fract(sin(dot(p ,vec3(12.9898,78.233,128.852))) * 43758.5453)*2.0-1.0;
    }

    float simplex3D(vec3 p)
    {
        
        float f3 = 1.0/3.0;
        float s = (p.x+p.y+p.z)*f3;
        int i = int(floor(p.x+s));
        int j = int(floor(p.y+s));
        int k = int(floor(p.z+s));
        
        float g3 = 1.0/6.0;
        float t = float((i+j+k))*g3;
        float x0 = float(i)-t;
        float y0 = float(j)-t;
        float z0 = float(k)-t;
        x0 = p.x-x0;
        y0 = p.y-y0;
        z0 = p.z-z0;
        
        int i1,j1,k1;
        int i2,j2,k2;
        
        if(x0>=y0)
        {
            if(y0>=z0){ i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; } // X Y Z order
            else if(x0>=z0){ i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; } // X Z Y order
            else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }  // Z X Z order
        }
        else 
        { 
            if(y0<z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; } // Z Y X order
            else if(x0<z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; } // Y Z X order
            else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; } // Y X Z order
        }
        
        float x1 = x0 - float(i1) + g3; 
        float y1 = y0 - float(j1) + g3;
        float z1 = z0 - float(k1) + g3;
        float x2 = x0 - float(i2) + 2.0*g3; 
        float y2 = y0 - float(j2) + 2.0*g3;
        float z2 = z0 - float(k2) + 2.0*g3;
        float x3 = x0 - 1.0 + 3.0*g3; 
        float y3 = y0 - 1.0 + 3.0*g3;
        float z3 = z0 - 1.0 + 3.0*g3;	
                    
        vec3 ijk0 = vec3(i,j,k);
        vec3 ijk1 = vec3(i+i1,j+j1,k+k1);	
        vec3 ijk2 = vec3(i+i2,j+j2,k+k2);
        vec3 ijk3 = vec3(i+1,j+1,k+1);	
                
        vec3 gr0 = normalize(vec3(noise3D(ijk0),noise3D(ijk0*2.01),noise3D(ijk0*2.02)));
        vec3 gr1 = normalize(vec3(noise3D(ijk1),noise3D(ijk1*2.01),noise3D(ijk1*2.02)));
        vec3 gr2 = normalize(vec3(noise3D(ijk2),noise3D(ijk2*2.01),noise3D(ijk2*2.02)));
        vec3 gr3 = normalize(vec3(noise3D(ijk3),noise3D(ijk3*2.01),noise3D(ijk3*2.02)));
        
        float n0 = 0.0;
        float n1 = 0.0;
        float n2 = 0.0;
        float n3 = 0.0;

        float t0 = 0.5 - x0*x0 - y0*y0 - z0*z0;
        if(t0>=0.0)
        {
            t0*=t0;
            n0 = t0 * t0 * dot(gr0, vec3(x0, y0, z0));
        }
        float t1 = 0.5 - x1*x1 - y1*y1 - z1*z1;
        if(t1>=0.0)
        {
            t1*=t1;
            n1 = t1 * t1 * dot(gr1, vec3(x1, y1, z1));
        }
        float t2 = 0.5 - x2*x2 - y2*y2 - z2*z2;
        if(t2>=0.0)
        {
            t2 *= t2;
            n2 = t2 * t2 * dot(gr2, vec3(x2, y2, z2));
        }
        float t3 = 0.5 - x3*x3 - y3*y3 - z3*z3;
        if(t3>=0.0)
        {
            t3 *= t3;
            n3 = t3 * t3 * dot(gr3, vec3(x3, y3, z3));
        }
        return 96.0*(n0+n1+n2+n3);
        
    }

    float fbm(vec3 p)
    {
        float f;
        f  = 0.50000*simplex3D( p ); p = p*2.01;
        f += 0.25000*simplex3D( p ); p = p*2.02; //from iq
        f += 0.12500*simplex3D( p ); p = p*2.03;
        f += 0.06250*simplex3D( p ); p = p*2.04;
        f += 0.03125*simplex3D( p );
        return f;
    }


    /*

    Every particle is stored in the grid by the integer part of it's coordinates.
    Colors and masses are stored in every odd line of the off screen surfaces
    A grid can't be shared by more than one particle. In that rare case their 
    mass get's combined and displayed as a bug. However it's possible to implement a 
    mechanism that splits them into multiple particles again.
    
    Play with gravity, grid size and bounciness.
    
    Energy loss also occours when a particle tries to go faster than the speed limit,
    which is one grid/frame, and also when more than 2 particles collide in the same time, 
    or with the wall.
    Buffer B can measure and display the total kinetic energy of the particles.
    
    */
   
#define NOISE_COLOR vec3(0.4, 0.33, 0.07)
#define NOISE_BACKGROUND_COLOR vec3(0.075, 0.0625, 0.0)
#define LIGHT_DIR_UV vec3(0.0, 0.0, 1.0)

    void main( )
    {
        vec3 lightbg = vec3(1.0, 1.0, 1.0);
        vec3 bg = vec3(0.5, 0.5, 0.5);

        // 1. background noise layer

        vec2 uv = vUv*2.0-1.0;
        
        // zoom scaling of the noise effect
        uv *= uvscale;

        float time = iTime * 1.0;
        vec3 col = vec3(0.0);
        float ns;
        ns = simplex3D(vec3(time,vec2(uv)))*0.5+0.5;
    
        ns = ns*ns;

        float delta = 0.01;
        float nsx = simplex3D(vec3(time,vec2(uv)+vec2(delta, 0.0)))*0.5+0.5;
        nsx = nsx*nsx;
        float nsy = simplex3D(vec3(time,vec2(uv)+vec2(0.0, delta)))*0.5+0.5;
        nsy = nsy*nsy;
        float dnx = (nsx-(ns))/delta;
        float dny = (nsy-(ns))/delta;
        float bumpFactor = 8.0;

//        float dnx = dFdx(ns);
//        float dny = dFdy(ns);
//        float bumpFactor = 128.0;

        vec3 normal = vec3(dnx, dny, 0.0)*bumpFactor;
        // transform this normal back into world space for proper lighting?
        normal = (mat3(viewMatrix)) * normal;
        normal = normalize(normal + n);

        float lightfg = clamp(dot(normal, directionalLights[0].direction), 0.0, 1.0);

        col = mix(NOISE_BACKGROUND_COLOR, NOISE_COLOR, 1.0 - (1.0-ns)*(1.0-ns)*lightfg);

        // 2. second layer: read from the particle simulation
#if USE_SIM
        uv = vUv;

        vec2 pixel = uv*vec2(float(GridX),float(GridY));
        vec2 grid = floor(uv*vec2(float(GridX),float(GridY)));
        float pixelsize = float(GridX)/iResolution.x;

        float minrad = Radius;
        vec2 minvec = vec2(0.0,0.0);
        vec3 moleculecolor = bg;
        float aa = 0.0;
        for(int y=-1;y<=1;y++) // check surrounding grids for particle
            for(int x=-1;x<=1;x++)
            {
                vec2 grid2 = grid+vec2(float(x),float(y));
                vec2 pos = getPos(grid2);
                float d = length(pixel-pos);
                if (d<minrad && pos.x!=0.0)
                {
                    minvec = pixel-pos;
                    aa = min((minrad-d)/pixelsize,1.);
                    minrad = d;
                    moleculecolor = getColorSize(grid2).xyz;
                    
                    // show buggy joint particles with different color
                    // if (getColorSize(grid2).a>1.0) moleculecolor = vec3(1.,0.,0.);
                }
            }

        // bumpy/lit particle normal?
        vec3 normal = vec3(minvec, sqrt(1.0-dot(minvec, minvec)));
        float lightfg = dot(normal, LIGHT_DIR_UV);

        // final color mix:
        col = mix(
            col*lightbg,
            lightfg * moleculecolor * smoothstep(0.5, 0.4, length(minvec*0.5) ) * texture2D(splat, (minvec/2.0 - 0.5) ).rgb,
            aa);
            
        // debug grids in use  
        //if (getColorSize(grid).a!=0.0) col=mix(col,vec3(1.,1.,1.),getColorSize(grid).a*0.3);
#endif
        ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
        reflectedLight.indirectDiffuse = getAmbientLightIrradiance( ambientLightColor );
        reflectedLight.indirectDiffuse += vIndirectFront;
        reflectedLight.directDiffuse = vLightFront * col;
        vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
        col = outgoingLight;

        gl_FragColor = vec4(col,1.0);
    }
`;

const MembraneShader = new ShaderMaterial({
    uniforms: {
        iTime: { value: 1.0 },
        iResolution: { value: new Vector2() },
        uvscale: { value: new Vector2(1.0, 1.0) },
        iChannel0: { value: null },
        iChannelResolution0: {
            value: new Vector2(dataTextureSize, dataTextureSize),
        },
        splat: { value: null },
        ///// LIGHTING
        ambientLightColor: { value: null },
        lightProbe: { value: null },
        directionalLights: { value: null },
        spotLights: { value: null },
        rectAreaLights: { value: null },
        pointLights: { value: null },
        hemisphereLights: { value: null },
        directionalShadowMap: { value: null },
        directionalShadowMatrix: { value: null },
        spotShadowMap: { value: null },
        spotShadowMatrix: { value: null },
        pointShadowMap: { value: null },
        pointShadowMatrix: { value: null },
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    defines: {
        PI: "3.14159265359",
        USE_SIM: "0",
        PHYSICALLY_CORRECT_LIGHTS: "1",
    },
    lights: true,
});

export default {
    MembraneShader: MembraneShader,
};
