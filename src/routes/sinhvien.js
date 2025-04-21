const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/connectDB');

// Middleware to check if user is logged in as a student
const requireStudentLogin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/taikhoan/dang-nhap?error=Vui lòng đăng nhập');
    }

    if (req.session.user.vaitro !== 'sinhvien') {
        return res.redirect('/taikhoan/dang-nhap?error=Vui lòng đăng nhập với tài khoản sinh viên');
    }

    next();
};

// Student dashboard route
router.get('/dashboard', requireStudentLogin, async (req, res) => {
    try {
        // Get student details
        const msv = req.session.user.id;

        // Get upcoming exams (next 7 days)
        let upcomingExams = [];
        try {
            // Check if lichthi table exists
            const tableCheck = await sequelize.query(
                "SHOW TABLES LIKE 'lichthi'",
                { type: sequelize.QueryTypes.SELECT }
            );

            if (tableCheck && tableCheck.length > 0) {
                // Get student's registered courses with 'đã đăng ký' status
                const registeredCourses = await sequelize.query(
                    `SELECT d.mahocphan
                     FROM dsdangkyhocphan d
                     WHERE d.msv = ? AND d.trangthaidangky = 'đã đăng ký'`,
                    {
                        replacements: [msv],
                        type: sequelize.QueryTypes.SELECT
                    }
                );

                if (registeredCourses && registeredCourses.length > 0) {
                    // Get the list of course IDs
                    const courseIds = registeredCourses.map(course => course.mahocphan);

                    // Get upcoming exams for these courses
                    const nextWeek = new Date();
                    nextWeek.setDate(nextWeek.getDate() + 7);

                    upcomingExams = await sequelize.query(
                        `SELECT l.*, c.tenhocphan 
                         FROM lichthi l
                         JOIN dangkyhocphan c ON l.mahocphan = c.mahocphan
                         WHERE l.mahocphan IN (?)
                         AND l.thoigianthi BETWEEN NOW() AND ?
                         ORDER BY l.thoigianthi ASC
                         LIMIT 5`,
                        {
                            replacements: [courseIds, nextWeek],
                            type: sequelize.QueryTypes.SELECT
                        }
                    );

                    // Format the exam date and time
                    upcomingExams.forEach(exam => {
                        const examDate = new Date(exam.thoigianthi);
                        exam.formattedDate = examDate.toLocaleDateString('vi-VN');
                        exam.formattedTime = examDate.toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    });
                }
            }
        } catch (examError) {
            console.error('Error fetching exams:', examError);
            // Continue with empty array
        }

        // Get latest news
        let latestNews = [];
        try {
            // Check if tintuc table exists
            const tableCheck = await sequelize.query(
                "SHOW TABLES LIKE 'tintuc'",
                { type: sequelize.QueryTypes.SELECT }
            );

            if (tableCheck && tableCheck.length > 0) {
                latestNews = await sequelize.query(
                    `SELECT * FROM tintuc ORDER BY ngaydang DESC LIMIT 5`,
                    { type: sequelize.QueryTypes.SELECT }
                );
            }
        } catch (newsError) {
            console.error('Error fetching news:', newsError);
            // Continue with empty array
        }

        // Get financial status
        let financialStatus = null;
        try {
            // Check if taichinh table exists
            const tableCheck = await sequelize.query(
                "SHOW TABLES LIKE 'taichinh'",
                { type: sequelize.QueryTypes.SELECT }
            );

            if (tableCheck && tableCheck.length > 0) {
                const financialRecords = await sequelize.query(
                    `SELECT * FROM taichinh WHERE msv = ?`,
                    {
                        replacements: [msv],
                        type: sequelize.QueryTypes.SELECT
                    }
                );

                if (financialRecords && financialRecords.length > 0) {
                    financialStatus = financialRecords[0];
                    financialStatus.conlai = parseFloat(financialStatus.khoanphainop) -
                        parseFloat(financialStatus.khoandanop) -
                        parseFloat(financialStatus.khoandocmien);
                }
            }
        } catch (financialError) {
            console.error('Error fetching financial status:', financialError);
            // Continue with null
        }

        // Get upcoming class schedule (today and tomorrow)
        let upcomingClasses = [];
        try {
            // Check if lichhoc table exists
            const tableCheck = await sequelize.query(
                "SHOW TABLES LIKE 'lichhoc'",
                { type: sequelize.QueryTypes.SELECT }
            );

            if (tableCheck && tableCheck.length > 0) {
                // Get student's registered courses
                const registeredCourses = await sequelize.query(
                    `SELECT d.mahocphan
                     FROM dsdangkyhocphan d
                     WHERE d.msv = ? AND d.trangthaidangky = 'đã đăng ký'`,
                    {
                        replacements: [msv],
                        type: sequelize.QueryTypes.SELECT
                    }
                );

                if (registeredCourses && registeredCourses.length > 0) {
                    // Get the list of course IDs
                    const courseIds = registeredCourses.map(course => course.mahocphan);

                    // Get today's day of week (0 = Sunday, 1 = Monday, etc.)
                    const today = new Date();
                    const tomorrow = new Date();
                    tomorrow.setDate(today.getDate() + 1);

                    // Convert to Vietnamese day format (Thứ 2, Thứ 3, etc.)
                    const getDayName = (day) => {
                        const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                        return days[day];
                    };

                    const todayName = getDayName(today.getDay());
                    const tomorrowName = getDayName(tomorrow.getDay());

                    // Get today and tomorrow's classes
                    upcomingClasses = await sequelize.query(
                        `SELECT l.*, c.tenhocphan 
                         FROM lichhoc l
                         JOIN dangkyhocphan c ON l.mahocphan = c.mahocphan
                         WHERE l.mahocphan IN (?)
                         AND (l.thu_lythuyet = ? OR l.thu_lythuyet = ?)
                         AND l.ngaybatdau <= CURDATE() AND l.ngayketthuc >= CURDATE()
                         ORDER BY 
                            CASE WHEN l.thu_lythuyet = ? THEN 0 ELSE 1 END,
                            l.cahoc_lythuyet ASC`,
                        {
                            replacements: [courseIds, todayName, tomorrowName, todayName],
                            type: sequelize.QueryTypes.SELECT
                        }
                    );

                    // Add day info to the classes
                    upcomingClasses.forEach(cls => {
                        cls.isToday = cls.thu_lythuyet === todayName;
                        cls.dayLabel = cls.isToday ? 'Hôm nay' : 'Ngày mai';
                        cls.timeRange = cls.cahoc_lythuyet;
                    });
                }
            }
        } catch (scheduleError) {
            console.error('Error fetching schedule:', scheduleError);
            // Continue with empty array
        }

        res.render('sinhvien/dashboard', {
            title: 'Trang chủ Sinh viên',
            user: req.session.user,
            upcomingExams,
            latestNews,
            financialStatus,
            upcomingClasses
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', {
            message: 'Đã xảy ra lỗi khi tải trang chủ',
            error
        });
    }
});

// Student schedule route
router.get('/lichhoc', requireStudentLogin, async (req, res) => {
    try {
        const msv = req.session.user.id;
        let registeredCourses = [];
        let schedules = [];
        let schedulesByDay = {};

        // Get student's registered courses with 'đã đăng ký' status
        try {
            registeredCourses = await sequelize.query(
                `SELECT d.mahocphan, c.tenhocphan 
                 FROM dsdangkyhocphan d
                 JOIN dangkyhocphan c ON d.mahocphan = c.mahocphan
                 WHERE d.msv = ? AND d.trangthaidangky = 'đã đăng ký'`,
                {
                    replacements: [msv],
                    type: sequelize.QueryTypes.SELECT
                }
            );
        } catch (error) {
            console.error("Error fetching registered courses:", error);
            // Continue with empty array
        }

        if (registeredCourses && registeredCourses.length > 0) {
            // Get the list of course IDs
            const courseIds = registeredCourses.map(course => course.mahocphan);

            // Get schedules for these courses
            try {
                schedules = await sequelize.query(
                    `SELECT l.*, c.tenhocphan 
                     FROM lichhoc l
                     JOIN dangkyhocphan c ON l.mahocphan = c.mahocphan
                     WHERE l.mahocphan IN (?)
                     ORDER BY l.ngaybatdau ASC, l.thu_lythuyet ASC`,
                    {
                        replacements: [courseIds],
                        type: sequelize.QueryTypes.SELECT
                    }
                );

                // Group schedules by day for easier display
                schedulesByDay = {};
                const weekdays = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

                schedules.forEach(schedule => {
                    const dayOfWeek = schedule.thu_lythuyet;

                    if (!schedulesByDay[dayOfWeek]) {
                        schedulesByDay[dayOfWeek] = [];
                    }
                    schedulesByDay[dayOfWeek].push(schedule);
                });
            } catch (error) {
                console.error("Error fetching schedules:", error);
                // Continue with empty arrays
            }
        }

        const message = (!registeredCourses || registeredCourses.length === 0) ?
            'Bạn chưa đăng ký học phần nào hoặc các học phần đăng ký chưa được phê duyệt.' : '';

        res.render('sinhvien/lichhoc', {
            title: 'Lịch Học Của Tôi',
            user: req.session.user,
            schedules: schedules || [],
            schedulesByDay: schedulesByDay || {},
            weekdays: ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'],
            courses: registeredCourses || [],
            message: message
        });
    } catch (error) {
        console.error('Lỗi tải lịch học sinh viên:', error);
        res.status(500).render('error', {
            message: 'Đã xảy ra lỗi khi tải lịch học của bạn',
            error
        });
    }
});

// Student exam schedule route
router.get('/lichthi', requireStudentLogin, async (req, res) => {
    try {
        const msv = req.session.user.id;

        // Get student's registered courses with 'đã đăng ký' status
        const registeredCourses = await sequelize.query(
            `SELECT d.mahocphan, c.tenhocphan 
             FROM dsdangkyhocphan d
             JOIN dangkyhocphan c ON d.mahocphan = c.mahocphan
             WHERE d.msv = ? AND d.trangthaidangky = 'đã đăng ký'`,
            {
                replacements: [msv],
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (!registeredCourses || registeredCourses.length === 0) {
            return res.render('sinhvien/lichthi', {
                title: 'Lịch Thi Của Tôi',
                user: req.session.user,
                examSchedules: [],
                message: 'Bạn chưa đăng ký học phần nào hoặc các học phần đăng ký chưa được phê duyệt.'
            });
        }

        // Get the list of course IDs
        const courseIds = registeredCourses.map(course => course.mahocphan);

        // Get exam schedules for these courses
        const examSchedules = await sequelize.query(
            `SELECT l.*, c.tenhocphan 
             FROM lichthi l
             JOIN dangkyhocphan c ON l.mahocphan = c.mahocphan
             WHERE l.mahocphan IN (?)
             ORDER BY l.thoigianthi ASC`,
            {
                replacements: [courseIds],
                type: sequelize.QueryTypes.SELECT
            }
        );

        // Format dates for display - Ensure proper timezone handling
        examSchedules.forEach(schedule => {
            if (schedule.thoigianthi) {
                // Create a new Date object without timezone conversion
                const date = new Date(schedule.thoigianthi);

                // Format date and time in local format to display to the user
                schedule.formattedDate = date.toLocaleDateString('vi-VN');
                schedule.formattedTime = date.toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                // Store the raw date for calculations in the template if needed
                schedule.examDateTime = date;
            }
        });

        res.render('sinhvien/lichthi', {
            title: 'Lịch Thi Của Tôi',
            user: req.session.user,
            examSchedules: examSchedules || [],
            courses: registeredCourses || [],
            currentDate: new Date() // Send current date for comparison
        });
    } catch (error) {
        console.error('Lỗi tải lịch thi sinh viên:', error);
        res.status(500).render('error', {
            message: 'Đã xảy ra lỗi khi tải lịch thi của bạn',
            error
        });
    }
});

// Student financial info route
router.get('/taichinh', requireStudentLogin, async (req, res) => {
    try {
        const msv = req.session.user.id;

        // Get student's financial information
        const financialRecords = await sequelize.query(
            `SELECT t.* 
             FROM taichinh t
             WHERE t.msv = ?`,
            {
                replacements: [msv],
                type: sequelize.QueryTypes.SELECT
            }
        );

        let financialRecord = null;
        if (financialRecords && financialRecords.length > 0) {
            financialRecord = financialRecords[0];

            // Calculate remaining amount
            financialRecord.conlai = parseFloat(financialRecord.khoanphainop) -
                parseFloat(financialRecord.khoandanop) -
                parseFloat(financialRecord.khoandocmien);

            // Get payment receipts
            const receipts = await sequelize.query(
                `SELECT * 
                 FROM phieuthu
                 WHERE taichinh_id = ?
                 ORDER BY thoigian DESC`,
                {
                    replacements: [financialRecord.id],
                    type: sequelize.QueryTypes.SELECT
                }
            );

            financialRecord.receipts = receipts || [];
        }

        res.render('sinhvien/taichinh', {
            title: 'Thông Tin Tài Chính',
            user: req.session.user,
            financialRecord: financialRecord,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('Lỗi tải thông tin tài chính sinh viên:', error);
        res.status(500).render('error', {
            message: 'Đã xảy ra lỗi khi tải thông tin tài chính của bạn',
            error
        });
    }
});

// Student course registration page
router.get('/dangkyhocphan', requireStudentLogin, async (req, res) => {
    try {
        const msv = req.session.user.id;

        // Get student's registered courses instead of all courses
        let courses = [];
        try {
            courses = await sequelize.query(
                `SELECT d.*, c.tenhocphan, c.sotinchi, c.loaihocphan, c.khoa, c.hocki 
                 FROM dsdangkyhocphan d
                 JOIN dangkyhocphan c ON d.mahocphan = c.mahocphan
                 WHERE d.msv = ?
                 ORDER BY c.tenhocphan`,
                {
                    replacements: [msv],
                    type: sequelize.QueryTypes.SELECT
                }
            );
        } catch (error) {
            console.error('Error fetching courses:', error);
            // Continue with empty array
        }

        // Get student's registration records (we need both for the UI logic)
        let registrations = [];
        try {
            registrations = await sequelize.query(
                `SELECT d.*, c.tenhocphan, c.sotinchi, c.loaihocphan 
                 FROM dsdangkyhocphan d
                 JOIN dangkyhocphan c ON d.mahocphan = c.mahocphan
                 WHERE d.msv = ?
                 ORDER BY d.id DESC`,
                {
                    replacements: [msv],
                    type: sequelize.QueryTypes.SELECT
                }
            );
        } catch (error) {
            console.error('Error fetching registrations:', error);
            // Continue with empty array
        }

        res.render('sinhvien/dangkyhocphan', {
            title: 'Đăng Ký Học Phần',
            user: req.session.user,
            courses: courses,
            registrations: registrations,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('Error loading registration page:', error);
        res.status(500).render('error', {
            message: 'Đã xảy ra lỗi khi tải trang đăng ký học phần',
            error
        });
    }
});

// Process course registration - RESTRICTED: Students can only view, not add registrations
router.post('/dangkyhocphan', requireStudentLogin, async (req, res) => {
    try {
        return res.redirect('/sinhvien/dangkyhocphan?error=Không có quyền đăng ký học phần. Vui lòng liên hệ quản trị viên để được hỗ trợ.');
    } catch (error) {
        console.error('Error registering for course:', error);
        res.redirect('/sinhvien/dangkyhocphan?error=Đã xảy ra lỗi khi đăng ký học phần: ' + error.message);
    }
});

// Confirm course registration - Students CAN update status from "chưa đăng ký" to "đã đăng ký"
router.post('/xacnhandangky', requireStudentLogin, async (req, res) => {
    try {
        const { mahocphan } = req.body;
        const msv = req.session.user.id;

        // Basic validation
        if (!mahocphan) {
            return res.redirect('/sinhvien/dangkyhocphan?error=Vui lòng chọn học phần');
        }

        // Check if the registration exists and is in "chưa đăng ký" status
        const registrations = await sequelize.query(
            `SELECT * FROM dsdangkyhocphan 
             WHERE msv = ? AND mahocphan = ? AND trangthaidangky = 'chưa đăng ký'`,
            {
                replacements: [msv, mahocphan],
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (!registrations || registrations.length === 0) {
            return res.redirect('/sinhvien/dangkyhocphan?error=Không tìm thấy đăng ký hoặc học phần đã được xác nhận');
        }

        // Update registration status to "đã đăng ký"
        await sequelize.query(
            `UPDATE dsdangkyhocphan 
             SET trangthaidangky = 'đã đăng ký' 
             WHERE msv = ? AND mahocphan = ? AND trangthaidangky = 'chưa đăng ký'`,
            {
                replacements: [msv, mahocphan],
                type: sequelize.QueryTypes.UPDATE
            }
        );

        res.redirect('/sinhvien/dangkyhocphan?success=Đăng ký học phần thành công');
    } catch (error) {
        console.error('Error confirming registration:', error);
        res.redirect('/sinhvien/dangkyhocphan?error=Đã xảy ra lỗi khi xác nhận đăng ký học phần: ' + error.message);
    }
});

// Cancel course registration - RESTRICTED: Students cannot cancel registrations
router.post('/huydangkyhocphan', requireStudentLogin, async (req, res) => {
    try {
        return res.redirect('/sinhvien/dangkyhocphan?error=Không có quyền hủy đăng ký học phần. Vui lòng liên hệ quản trị viên để được hỗ trợ.');
    } catch (error) {
        console.error('Error canceling registration:', error);
        res.redirect('/sinhvien/dangkyhocphan?error=Đã xảy ra lỗi khi hủy đăng ký học phần: ' + error.message);
    }
});

// View grades route
router.get('/diem', requireStudentLogin, async (req, res) => {
    try {
        const msv = req.session.user.id;

        // Get all grades for this student
        const grades = await sequelize.query(
            `SELECT d.*, c.tenhocphan, c.sotinchi
             FROM diem d
             JOIN dangkyhocphan c ON d.hocphan = c.mahocphan
             WHERE d.msv = ?
             ORDER BY d.hocki DESC, c.tenhocphan ASC`,
            {
                replacements: [msv],
                type: sequelize.QueryTypes.SELECT
            }
        );

        // Calculate GPA
        let totalPoints = 0;
        let totalCredits = 0;
        let passedCredits = 0;
        let failedCredits = 0;

        grades.forEach(grade => {
            if (grade.sotinchi && !isNaN(parseFloat(grade.sotinchi))) {
                const credits = parseFloat(grade.sotinchi);
                totalCredits += credits;

                if (grade.trangthai === 'đạt') {
                    passedCredits += credits;
                    if (grade.diemtongket !== null) {
                        totalPoints += grade.diemtongket * credits;
                    }
                } else if (grade.trangthai === 'học lại') {
                    failedCredits += credits;
                }
            }
        });

        const gpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : 0;

        // Group grades by semester
        const gradesBySemester = {};
        grades.forEach(grade => {
            if (!gradesBySemester[grade.hocki]) {
                gradesBySemester[grade.hocki] = [];
            }
            gradesBySemester[grade.hocki].push(grade);
        });

        res.render('sinhvien/diem', {
            title: 'Điểm số của tôi',
            user: req.session.user,
            grades: grades || [],
            gradesBySemester,
            gpa,
            totalCredits,
            passedCredits,
            failedCredits
        });
    } catch (error) {
        console.error('Lỗi tải điểm sinh viên:', error);
        res.status(500).render('error', {
            message: 'Đã xảy ra lỗi khi tải điểm của bạn',
            error
        });
    }
});

// Student profile page
router.get('/thongtin', requireStudentLogin, async (req, res) => {
    try {
        const msv = req.session.user.id;

        // Get full student information
        const students = await sequelize.query(
            `SELECT * FROM sinhvien WHERE msv = ?`,
            {
                replacements: [msv],
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (!students || students.length === 0) {
            return res.status(404).render('error', {
                message: 'Không tìm thấy thông tin sinh viên',
                error: { status: 404 }
            });
        }

        const student = students[0];

        res.render('sinhvien/thongtin', {
            title: 'Thông Tin Sinh Viên',
            user: req.session.user,
            student,
            error: req.query.error,
            success: req.query.success
        });
    } catch (error) {
        console.error('Lỗi tải thông tin sinh viên:', error);
        res.status(500).render('error', {
            message: 'Đã xảy ra lỗi khi tải thông tin sinh viên',
            error
        });
    }
});

// News list page
router.get('/tintuc', requireStudentLogin, async (req, res) => {
    try {
        // Get all news
        const news = await sequelize.query(
            `SELECT * FROM tintuc ORDER BY ngaydang DESC`,
            {
                type: sequelize.QueryTypes.SELECT
            }
        );

        // Group news by category
        const newsByCategory = {};
        news.forEach(item => {
            if (!newsByCategory[item.danhmuc]) {
                newsByCategory[item.danhmuc] = [];
            }
            newsByCategory[item.danhmuc].push(item);
        });

        res.render('sinhvien/tintuc', {
            title: 'Tin Tức',
            user: req.session.user,
            news: news || [],
            newsByCategory
        });
    } catch (error) {
        console.error('Lỗi tải tin tức:', error);
        res.status(500).render('error', {
            message: 'Đã xảy ra lỗi khi tải tin tức',
            error
        });
    }
});

// Change password page
router.get('/doimatkhau', requireStudentLogin, (req, res) => {
    res.render('sinhvien/doimatkhau', {
        title: 'Đổi Mật Khẩu',
        user: req.session.user,
        error: req.query.error,
        success: req.query.success
    });
});

// Process password change
router.post('/doimatkhau', requireStudentLogin, async (req, res) => {
    try {
        const { matkhau_cu, matkhau_moi, xacnhan_matkhau } = req.body;
        const msv = req.session.user.id;

        // Basic validation
        if (!matkhau_cu || !matkhau_moi || !xacnhan_matkhau) {
            return res.redirect('/sinhvien/doimatkhau?error=Vui lòng điền đầy đủ thông tin');
        }

        if (matkhau_moi.length < 6) {
            return res.redirect('/sinhvien/doimatkhau?error=Mật khẩu mới phải có ít nhất 6 ký tự');
        }

        if (matkhau_moi !== xacnhan_matkhau) {
            return res.redirect('/sinhvien/doimatkhau?error=Mật khẩu xác nhận không khớp');
        }

        // Get current password
        const students = await sequelize.query(
            `SELECT matkhau FROM sinhvien WHERE msv = ?`,
            {
                replacements: [msv],
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (!students || students.length === 0) {
            return res.redirect('/sinhvien/doimatkhau?error=Không tìm thấy thông tin sinh viên');
        }

        const bcrypt = require('bcryptjs');
        const currentHashedPassword = students[0].matkhau;

        // Verify current password
        const isMatch = await bcrypt.compare(matkhau_cu, currentHashedPassword);
        if (!isMatch) {
            return res.redirect('/sinhvien/doimatkhau?error=Mật khẩu hiện tại không đúng');
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(matkhau_moi, salt);

        // Update password
        await sequelize.query(
            `UPDATE sinhvien SET matkhau = ? WHERE msv = ?`,
            {
                replacements: [hashedPassword, msv],
                type: sequelize.QueryTypes.UPDATE
            }
        );

        res.redirect('/sinhvien/doimatkhau?success=Đổi mật khẩu thành công');
    } catch (error) {
        console.error('Lỗi đổi mật khẩu:', error);
        res.redirect('/sinhvien/doimatkhau?error=Đã xảy ra lỗi khi đổi mật khẩu: ' + error.message);
    }
});

module.exports = router;
