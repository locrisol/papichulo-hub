package com.papichulo;

import com.papichulo.config.DatabaseConfig;
import javafx.application.Application;
import javafx.scene.Scene;
import javafx.scene.control.Label;
import javafx.scene.layout.StackPane;
import javafx.stage.Stage;

import java.sql.Connection;
import java.sql.SQLException;

public class Main extends Application {

    @Override
    public void start(Stage stage) {
        String statusMessage;

        try {
            Connection conn = DatabaseConfig.getConnection();
            statusMessage = "Supabase connection successful ✓";
            conn.close();
        } catch (SQLException e) {
            statusMessage = "Connection error: " + e.getMessage();
        }

        Label label = new Label(statusMessage);
        StackPane root = new StackPane(label);
        Scene scene = new Scene(root, 800, 600);
        stage.setTitle("Papi Chulo Forecast");
        stage.setScene(scene);
        stage.show();
    }

    public static void main(String[] args) {
        launch(args);
    }
}