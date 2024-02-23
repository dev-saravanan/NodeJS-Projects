const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

let db = null;
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server Started");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
  }
};

initializeDBAndServer();

// Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const getUserDetailsQuery = `SELECT * FROM user WHERE username = '${username}';`;

  const userDetail = await db.get(getUserDetailsQuery);

  if (userDetail !== undefined) {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userDetail.password
    );

    if (isPasswordMatched) {
      const payLoad = {
        username: username,
      };
      const jwtToken = jwt.sign(payLoad, "saravanan");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//Authenticate Token - Middleware Function
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "saravanan", (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

// GET ALL STATES
app.get("/states/", authenticateToken, async (request, response) => {
  const getAllStatesQuery = `
        SELECT * FROM 
        state
    `;

  const allStatesList = await db.all(getAllStatesQuery);

  const formattedStatesList = allStatesList.map((eachItem) => ({
    stateId: eachItem.state_id,
    stateName: eachItem.state_name,
    population: eachItem.population,
  }));

  response.send(formattedStatesList);
});

//GET STATES DETAIL BASED ON ID
app.get("/states/:stateId", authenticateToken, async (request, response) => {
  const { stateId } = request.params;

  const getDetailsOfStatesQuery = `
        SELECT * FROM 
        state 
        WHERE state_id = ${stateId};
    `;

  const stateDetail = await db.get(getDetailsOfStatesQuery);

  const formattedStateDetail = {
    stateId: stateDetail.state_id,
    stateName: stateDetail.state_name,
    population: stateDetail.population,
  };

  response.send(formattedStateDetail);
});

//CREATE A DISTRICT IN DISTRICT TABLE
app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetail = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetail;

  const addNewDistrictQuery = `
    INSERT INTO district (district_name, state_id, cases, cured, active, deaths)
    VALUES(
        '${districtName}',
        '${stateId}',
        '${cases}',
        '${cured}',
        '${active}',
        '${deaths}'
    );
  `;

  const dbResponse = await db.run(addNewDistrictQuery);

  response.send("District Successfully Added");
});

// GET DISTRICT BASED ON DISTRICT ID
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;

    const getDistrictDetailsQuery = `
        SELECT * FROM district
        WHERE district_id = ${districtId};
    `;

    const districtDetails = await db.get(getDistrictDetailsQuery);

    const formattedDistrictDetails = {
      districtId: districtDetails.district_id,
      districtName: districtDetails.district_name,
      stateId: districtDetails.state_id,
      cases: districtDetails.cases,
      cured: districtDetails.cured,
      active: districtDetails.active,
      deaths: districtDetails.deaths,
    };

    response.send(formattedDistrictDetails);
  }
);

//DELETE DISTRICT BASED ON ID
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;

    const deleteDistrictQuery = `
        DELETE FROM district WHERE district_id = ${districtId};
    `;

    const dbResponse = await db.run(deleteDistrictQuery);

    response.send("District Removed");
  }
);

// UPDATE DISTRICT DETAILS BASED ON ID
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const newDistrictDetails = request.body;

    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = newDistrictDetails;

    const updateDistrictDetailsQuery = `
    UPDATE district SET 
        district_name = '${districtName}',
        state_id = ${stateId},
        cases = ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
    
    WHERE district_id = ${districtId} ;
  `;

    await db.run(updateDistrictDetailsQuery);

    response.send("District Details Updated");
  }
);

//GET STATE STATISTICS
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;

    const getStateStatisticsQuery = `
        SELECT 
        SUM(district.cases) AS total_cases,
        SUM(district.cured) AS total_cured,
        SUM(district.active) AS total_active,
        SUM(district.deaths) AS total_deaths
        FROM state LEFT JOIN district
        ON state.state_id = district.state_id
        GROUP BY state.state_id
        HAVING state.state_id = ${stateId};
    `;

    const stateStatistics = await db.get(getStateStatisticsQuery);

    const formattedStateStatistics = {
      totalCases: stateStatistics.total_cases,
      totalCured: stateStatistics.total_cured,
      totalActive: stateStatistics.total_active,
      totalDeaths: stateStatistics.total_deaths,
    };

    response.send(formattedStateStatistics);
  }
);

//GET STATE NAME OF THE DISTRICTS
app.get(
  "/districts/:districtId/details/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;

    const getStateNameOfDistrictsQuery = `
        SELECT state_name FROM 
        state INNER JOIN district 
        ON state.state_id = district.state_id
        WHERE district.district_id = ${districtId};
    `;

    const stateNameList = await db.get(getStateNameOfDistrictsQuery);

    const formattedStateNameList = { stateName: stateNameList.state_name };

    response.send(formattedStateNameList);
  }
);

module.exports = app;
