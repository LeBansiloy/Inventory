const mysql = require('mysql2/promise');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const dbConfig = {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'LeBansiloy06',
    database: 'dbms',
    multipleStatements: true,
    timezone: '+00:00'
};

let studentIndexMap = new Map();

(async function main() {
    try {
        const conn = await mysql.createConnection(dbConfig);
        console.log("Connected to database successfully.");

        while (true) {
            console.log("\n--- MENU ---");
            console.log("1. Enroll a Student");
            console.log("2. View Unnormalized Data");
            console.log("3. View 1st Normal Form (1NF)");
            console.log("4. View 2nd Normal Form (2NF)");
            console.log("5. View 3rd Normal Form (3NF)");
            console.log("6. Exit");

            const choice = await askQuestion("Enter your choice (1-6): ");

            if (choice === '1') {
                await enrollStudent(conn);
            } else if (choice === '2') {
                await viewUnnormalizedData(conn);
            } else if (choice === '3') {
                await view1NF(conn);
            } else if (choice === '4') {
                await view2NF(conn);
            } else if (choice === '5') {
                await view3NF(conn);
            } else if (choice === '6') {
                console.log("Exiting...");
                break;
            } else {
                console.log("Invalid choice, please enter a number between 1 and 6.");
            }
        }

        await conn.end();
        rl.close();
    } catch (err) {
        console.error("Database connection failed:", err.message);
        rl.close();
    }
})();

async function enrollStudent(conn) {
    try {
        const studentName = await askQuestion("Enter student full name: ");
        const teacherName = await askQuestion("Enter teacher full name: ");
        const subjectName = await askQuestion("Enter subject name: ");
        const email = await askQuestion("Enter teacher email: ");
        
        const [subject] = await conn.execute("INSERT INTO subjects (subject_name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)", [subjectName]);
        const subjectId = subject.insertId;

        const [teacher] = await conn.execute("INSERT INTO teachers (full_name, email) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)", [teacherName, email]);
        const teacherId = teacher.insertId;

        const [student] = await conn.execute("INSERT INTO students (full_name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)", [studentName]);
        const studentId = student.insertId;

        const [classEntry] = await conn.execute("INSERT INTO classes (subject_id, teacher_id, class_name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)", [subjectId, teacherId, `${subjectName} with ${teacherName}`]);
        const classId = classEntry.insertId;

        await conn.execute("INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)", [studentId, classId]);

        console.log("Enrollment successful.");
    } catch (err) {
        console.error("Error during enrollment:", err.message);
    }
}


const Table = require('cli-table3'); // Import cli-table3

async function viewUnnormalizedData(conn) {
    const [rows] = await conn.execute(`
        SELECT students.id AS student_id, 
               students.full_name AS student_name, 
               subjects.subject_name AS subject, 
               teachers.id AS teacher_id, 
               teachers.full_name AS teacher_name, 
               teachers.email AS teacher_email
        FROM enrollments
        JOIN students ON enrollments.student_id = students.id
        JOIN classes ON enrollments.class_id = classes.id
        JOIN teachers ON classes.teacher_id = teachers.id
        JOIN subjects ON classes.subject_id = subjects.id
    `);

    // Create a new table instance
    const table = new Table({
        head: ['student_id', 'student_name', 'subject', 'teacher_id', 'teacher_name', 'teacher_email'],
        colWidths: [12, 20, 15, 12, 20, 25] // Adjust column widths
    });

    // Add each row to the table
    rows.forEach(row => {
        table.push([
            row.student_id,
            row.student_name,
            row.subject,
            row.teacher_id,
            row.teacher_name,
            row.teacher_email
        ]);
    });

    console.log(table.toString()); // Print the formatted table
}






async function view1NF(conn) {
    const [rows] = await conn.execute(`
        SELECT enrollments.id AS enrollment_id, 
               students.full_name AS student_name, 
               students.id AS student_id,
               subjects.subject_name AS subject, 
               teachers.id AS teacher_id,
               teachers.full_name AS teacher_name,
               teachers.email AS teacher_email
        FROM enrollments
        JOIN students ON enrollments.student_id = students.id
        JOIN classes ON enrollments.class_id = classes.id
        JOIN subjects ON classes.subject_id = subjects.id
        JOIN teachers ON classes.teacher_id = teachers.id
        ORDER BY enrollment_id
    `);

    // Process rows to split multiple names into separate rows
    let processedRows = [];
    let index = 1; // Start index from 1

    rows.forEach(row => {
        let names = row.student_name.split(',').map(name => name.trim()); // Split names by comma
        
        names.forEach(name => {
            processedRows.push({
                Student_Name: name,  // Single atomic student name
                Student_ID: row.student_id, // Keep same student_id
                Subject: row.subject, // No comma-separated subjects
                Teacher_ID: row.teacher_id,
                Teacher_Name: row.teacher_name,
                Teacher_Email: row.teacher_email
            });
        });
    });

    console.log("\n--- First Normal Form (1NF) - Flattened Data ---");
    
    // ✅ Display the data properly formatted in a table
    console.table(processedRows);
}










async function view2NF(conn) {
    // Students Table (Fix Duplicates & Split Multiple Names)
    const [studentsRaw] = await conn.execute(`
        SELECT students.id AS student_id, students.full_name AS student_name
        FROM students
        ORDER BY students.full_name
    `);

    // Process students: Remove duplicates and split names
    const uniqueStudents = [];
    const studentSet = new Set();

    for (const student of studentsRaw) {
        const names = student.student_name.split(',').map(name => name.trim()); // Split names by ','

        for (const name of names) {
            if (!studentSet.has(name)) {
                studentSet.add(name);
                uniqueStudents.push({ student_id: student.student_id, student_name: name });
            }
        }
    }

    // Subjects Table (Fix Duplicates Manually)
    const [subjectsRaw] = await conn.execute(`
        SELECT subjects.id AS subject_id, subjects.subject_name
        FROM subjects
        ORDER BY subjects.subject_name
    `);

    // Remove duplicate subject names
    const uniqueSubjects = [];
    const subjectSet = new Set();
    for (const sub of subjectsRaw) {
        if (!subjectSet.has(sub.subject_name)) {
            subjectSet.add(sub.subject_name);
            uniqueSubjects.push(sub);
        }
    }

    // Teachers Table (Fix Duplicates Manually)
    const [teachersRaw] = await conn.execute(`
        SELECT teachers.id AS teacher_id, teachers.full_name AS teacher_name
        FROM teachers
        ORDER BY teachers.full_name
    `);

    // Remove duplicate teacher names
    const uniqueTeachers = [];
    const teacherSet = new Set();
    for (const teacher of teachersRaw) {
        if (!teacherSet.has(teacher.teacher_name)) {
            teacherSet.add(teacher.teacher_name);
            uniqueTeachers.push(teacher);
        }
    }

    // Classes Table (Only Class ID & Name - Remove subject/teacher details)
    const [classes] = await conn.execute(`
        SELECT classes.id AS class_id, 
               classes.class_name
        FROM classes
        ORDER BY class_id
    `);

    // Display tables
    console.log("\n--- Students (No Duplicates & Split Names) ---");
    console.table(uniqueStudents);

    console.log("\n--- Subjects (No Duplicates) ---");
    console.table(uniqueSubjects);

    console.log("\n--- Teachers (No Duplicates) ---");
    console.table(uniqueTeachers);

    console.log("\n--- Classes (Only ID & Name) ---");
    console.table(classes);
}












async function view3NF(conn) {
    // Classes Table (Only IDs)
    const [classes] = await conn.execute(`
        SELECT classes.id AS class_id, 
               classes.subject_id, 
               classes.teacher_id
        FROM classes
        ORDER BY class_id
    `);

    // Enrollments Table (Only Student-Class Relationship)
    const [enrollments] = await conn.execute(`
        SELECT enrollments.student_id, 
               enrollments.class_id
        FROM enrollments
        ORDER BY enrollments.student_id, enrollments.class_id
    `);

    console.log("\n--- Classes Table (Only IDs) ---");
    console.table(classes);

    console.log("\n--- Enrollments Table (Only Student-Class Relationship) ---");
    console.table(enrollments);
}







function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}